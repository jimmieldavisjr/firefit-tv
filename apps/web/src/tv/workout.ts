// TV-side session state machine (pure, unit-tested). One session = squats -> push-ups -> plank.
// The TV is authoritative for progress: it counts reps from the phone's "rep" events (squat, push-up) and reads the
// plank hold time from state messages, only while ACTIVE, so a resetSet crossing an in-flight message can never
// complete a set by accident.
//   READY (full body visible 2 s) -> ACTIVE -> REST -> ACTIVE ... -> TRANSITION (move the phone) -> READY (next block)
//   ... -> COMPLETE. PAUSED wraps any phase and resumes where it left off.
import { EXERCISE_INFO } from "@firefit/shared/programs";
import type { BlockPlan, Rep, WorkoutInput } from "@firefit/shared";

export const READY_HOLD_MS = 2000;
export const TRANSITION_SEC = 40;
const REST_MET = 1.3; // standing rest; Compendium of Physical Activities

export type Phase = "ready" | "active" | "rest" | "transition" | "paused" | "complete";
type Resumable = Exclude<Phase, "paused" | "complete">;
export type BlockLog = { perSet: number[]; setSec: number[]; perRep: Rep[]; cues: string[]; activeMs: number };

export type SessionState = {
  plan: BlockPlan[];
  phase: Phase;
  block: number; // index into plan
  set: number; // 1-based within the block
  setReps: number;
  holdMs: number; // plank: good-form time in the current set
  holdGood: boolean;
  logs: BlockLog[];
  visible: boolean;
  readySince: number | null;
  restEndsAt: number | null;
  setStartedAt: number | null;
  pausedFrom: Resumable | null;
  pausedAt: number | null;
  pausedMs: number;
  firstActiveAt: number | null;
  completedAt: number | null;
};

export type SessionEvent =
  | { type: "visible"; visible: boolean; now: number }
  | { type: "rep"; rep: Rep; now: number }
  | { type: "hold"; holdMs: number; good: boolean; now: number }
  | { type: "tick"; now: number }
  | { type: "select"; now: number } // primary action: start now / end set / skip rest / resume
  | { type: "playpause"; now: number };

export const current = (s: SessionState) => s.plan[Math.min(s.block, s.plan.length - 1)];
export const isTimed = (b: BlockPlan) => EXERCISE_INFO[b.exercise].unit === "sec";
/** Progress toward the set target: reps, or whole seconds held for the plank. */
export const setProgress = (s: SessionState) => (isTimed(current(s)) ? Math.floor(s.holdMs / 1000) : s.setReps);

export function initSession(plan: BlockPlan[]): SessionState {
  return {
    plan,
    phase: "ready",
    block: 0,
    set: 1,
    setReps: 0,
    holdMs: 0,
    holdGood: false,
    logs: plan.map(() => ({ perSet: [], setSec: [], perRep: [], cues: [], activeMs: 0 })),
    visible: false,
    readySince: null,
    restEndsAt: null,
    setStartedAt: null,
    pausedFrom: null,
    pausedAt: null,
    pausedMs: 0,
    firstActiveAt: null,
    completedAt: null,
  };
}

function activate(s: SessionState, now: number): SessionState {
  return { ...s, phase: "active", setReps: 0, holdMs: 0, holdGood: false, readySince: null, restEndsAt: null, setStartedAt: now, firstActiveAt: s.firstActiveAt ?? now };
}

function endSet(s: SessionState, now: number): SessionState {
  const b = current(s);
  const spent = s.setStartedAt ? now - s.setStartedAt : 0;
  const logs = s.logs.map((l, i) =>
    i !== s.block ? l : { ...l, perSet: [...l.perSet, setProgress(s)], setSec: [...l.setSec, Math.round(spent / 1000)], activeMs: l.activeMs + spent },
  );
  const next = { ...s, logs, setStartedAt: null };
  if (s.set < b.sets) return { ...next, phase: "rest", restEndsAt: now + b.restSec * 1000 };
  if (s.block < s.plan.length - 1) return { ...next, phase: "transition", restEndsAt: now + TRANSITION_SEC * 1000 };
  return { ...next, phase: "complete", completedAt: now };
}

export function sessionReducer(s: SessionState, e: SessionEvent): SessionState {
  if (s.phase === "complete") return s;

  if (s.phase === "paused") {
    if (e.type === "visible") return { ...s, visible: e.visible };
    if (e.type !== "playpause" && e.type !== "select") return s;
    const away = e.now - (s.pausedAt ?? e.now);
    return {
      ...s,
      phase: s.pausedFrom ?? "active",
      pausedFrom: null,
      pausedAt: null,
      pausedMs: s.pausedMs + (s.firstActiveAt ? away : 0),
      restEndsAt: s.restEndsAt !== null ? s.restEndsAt + away : null,
      setStartedAt: s.setStartedAt !== null ? s.setStartedAt + away : null,
      readySince: null,
    };
  }

  if (e.type === "playpause") return { ...s, phase: "paused", pausedFrom: s.phase, pausedAt: e.now };
  if (e.type === "visible") {
    if (s.phase !== "ready") return { ...s, visible: e.visible };
    const readySince = e.visible ? (s.readySince ?? e.now) : null;
    const next = { ...s, visible: e.visible, readySince };
    return readySince !== null && e.now - readySince >= READY_HOLD_MS ? activate(next, e.now) : next;
  }

  switch (s.phase) {
    case "ready":
      return e.type === "select" ? activate(s, e.now) : s;
    case "active": {
      const b = current(s);
      if (e.type === "select") return endSet(s, e.now);
      if (e.type === "rep" && !isTimed(b)) {
        const logs = s.logs.map((l, i) => (i !== s.block ? l : { ...l, perRep: [...l.perRep, e.rep], cues: e.rep.cue ? [...l.cues, e.rep.cue] : l.cues }));
        const next = { ...s, logs, setReps: s.setReps + 1 };
        return next.setReps >= b.target ? endSet(next, e.now) : next;
      }
      if (e.type === "hold" && isTimed(b)) {
        const next = { ...s, holdMs: Math.max(s.holdMs, e.holdMs), holdGood: e.good };
        return next.holdMs >= b.target * 1000 ? endSet(next, e.now) : next;
      }
      return s;
    }
    case "rest": {
      const done = e.type === "select" || (e.type === "tick" && s.restEndsAt !== null && e.now >= s.restEndsAt);
      return done ? activate({ ...s, set: s.set + 1 }, e.now) : s;
    }
    case "transition": {
      const done = e.type === "select" || (e.type === "tick" && s.restEndsAt !== null && e.now >= s.restEndsAt);
      return done ? { ...s, phase: "ready", block: s.block + 1, set: 1, setReps: 0, holdMs: 0, restEndsAt: null, readySince: null, visible: false } : s;
    }
  }
  return s;
}

/** Seconds of session time: from the first ACTIVE until now (or completion), excluding pauses. */
export function elapsedSec(s: SessionState, now: number) {
  if (!s.firstActiveAt) return 0;
  const end = s.completedAt ?? (s.phase === "paused" ? (s.pausedAt ?? now) : now);
  return Math.max(0, Math.round((end - s.firstActiveAt - s.pausedMs) / 1000));
}

export function activeMs(s: SessionState, now: number) {
  const done = s.logs.reduce((a, l) => a + l.activeMs, 0);
  return done + (s.phase === "active" && s.setStartedAt ? now - s.setStartedAt : 0);
}

/** Labeled estimate: MET x 3.5 x kg / 200 per minute (ACSM), per exercise for active time, light MET for the rest. */
export function caloriesEst(s: SessionState, now: number, kg: number) {
  const perMin = (met: number) => (met * 3.5 * kg) / 200;
  let kcal = 0;
  s.plan.forEach((b, i) => {
    const ms = s.logs[i].activeMs + (i === s.block && s.phase === "active" && s.setStartedAt ? now - s.setStartedAt : 0);
    kcal += perMin(EXERCISE_INFO[b.exercise].met) * (ms / 60000);
  });
  const restMin = Math.max(0, elapsedSec(s, now) - activeMs(s, now) / 1000) / 60;
  return Math.round(kcal + perMin(REST_MET) * restMin);
}

export function setsDone(s: SessionState) {
  return s.logs.reduce((a, l) => a + l.perSet.length, 0);
}
export const totalSets = (s: SessionState) => s.plan.reduce((a, b) => a + b.sets, 0);

export function toWorkoutInput(s: SessionState, kg: number): WorkoutInput {
  const now = s.completedAt ?? Date.now();
  const blocks = s.plan
    .map((b, i) => ({
      exercise: b.exercise,
      sets: b.sets,
      target: b.target,
      setsDone: s.logs[i].perSet.length,
      perSet: s.logs[i].perSet,
      setSec: s.logs[i].setSec,
      perRep: s.logs[i].perRep.slice(0, 300),
      cues: s.logs[i].cues.slice(0, 50),
    }))
    .filter((b) => b.setsDone > 0);
  return {
    plan: "full-body",
    blocks: blocks.length ? blocks : [{ exercise: s.plan[0].exercise, sets: s.plan[0].sets, target: s.plan[0].target, setsDone: 0, perSet: [], setSec: [], perRep: [], cues: [] }],
    durationSec: elapsedSec(s, now),
    activeSec: Math.round(activeMs(s, now) / 1000),
    caloriesEst: caloriesEst(s, now, kg),
    bodyWeightKg: kg,
  };
}
