// TV-side workout state machine (pure, unit-tested). The TV is authoritative for progress: it counts reps from
// the phone's "rep" events while ACTIVE and ignores the phone's cumulative counter, so a resetSet crossing an
// in-flight state message can never complete a set by accident.
//   READY (full body visible for 2 s) -> ACTIVE -> REST -> ACTIVE (next set) ... -> COMPLETE
//   PAUSED wraps any of READY / ACTIVE / REST and resumes where it left off.
import type { Exercise, Rep, WorkoutInput } from "@firefit/shared";

export const READY_HOLD_MS = 2000;

export type Phase = "ready" | "active" | "rest" | "paused" | "complete";
export type Plan = { exercise: Exercise; sets: number; targetReps: number; restSec: number };

export type WorkoutState = {
  plan: Plan;
  phase: Phase;
  set: number; // 1-based
  setReps: number;
  repsBySet: number[];
  perRep: Rep[];
  visible: boolean;
  readySince: number | null;
  restEndsAt: number | null;
  pausedFrom: Exclude<Phase, "paused" | "complete"> | null;
  pausedAt: number | null;
  pausedMs: number;
  firstActiveAt: number | null;
  completedAt: number | null;
};

export type WorkoutEvent =
  | { type: "visible"; visible: boolean; now: number }
  | { type: "rep"; rep: Rep; now: number }
  | { type: "tick"; now: number }
  | { type: "select"; now: number } // primary action: start now / end set / skip rest / resume
  | { type: "playpause"; now: number };

export function initWorkout(plan: Plan): WorkoutState {
  return {
    plan,
    phase: "ready",
    set: 1,
    setReps: 0,
    repsBySet: [],
    perRep: [],
    visible: false,
    readySince: null,
    restEndsAt: null,
    pausedFrom: null,
    pausedAt: null,
    pausedMs: 0,
    firstActiveAt: null,
    completedAt: null,
  };
}

function activate(s: WorkoutState, now: number): WorkoutState {
  return { ...s, phase: "active", setReps: 0, readySince: null, restEndsAt: null, firstActiveAt: s.firstActiveAt ?? now };
}

function endSet(s: WorkoutState, now: number): WorkoutState {
  const repsBySet = [...s.repsBySet, s.setReps];
  if (s.set >= s.plan.sets) return { ...s, repsBySet, phase: "complete", completedAt: now };
  return { ...s, repsBySet, phase: "rest", restEndsAt: now + s.plan.restSec * 1000 };
}

export function workoutReducer(s: WorkoutState, e: WorkoutEvent): WorkoutState {
  if (s.phase === "complete") return s;

  if (s.phase === "paused") {
    if (e.type === "visible") return { ...s, visible: e.visible };
    if (e.type !== "playpause" && e.type !== "select") return s;
    const away = e.now - (s.pausedAt ?? e.now);
    const resumed = s.pausedFrom ?? "active";
    return {
      ...s,
      phase: resumed,
      pausedFrom: null,
      pausedAt: null,
      pausedMs: s.pausedMs + (s.firstActiveAt ? away : 0),
      restEndsAt: s.restEndsAt !== null ? s.restEndsAt + away : null,
      readySince: null,
    };
  }

  if (e.type === "playpause") return { ...s, phase: "paused", pausedFrom: s.phase, pausedAt: e.now };

  switch (s.phase) {
    case "ready": {
      if (e.type === "select") return activate(s, e.now);
      if (e.type === "visible") {
        const readySince = e.visible ? (s.readySince ?? e.now) : null;
        const next = { ...s, visible: e.visible, readySince };
        return readySince !== null && e.now - readySince >= READY_HOLD_MS ? activate(next, e.now) : next;
      }
      return s;
    }
    case "active": {
      if (e.type === "visible") return { ...s, visible: e.visible };
      if (e.type === "select") return endSet(s, e.now);
      if (e.type === "rep") {
        const next = { ...s, setReps: s.setReps + 1, perRep: [...s.perRep, e.rep] };
        return next.setReps >= s.plan.targetReps ? endSet(next, e.now) : next;
      }
      return s;
    }
    case "rest": {
      if (e.type === "visible") return { ...s, visible: e.visible };
      const done = e.type === "select" || (e.type === "tick" && s.restEndsAt !== null && e.now >= s.restEndsAt);
      return done ? activate({ ...s, set: s.set + 1 }, e.now) : s;
    }
  }
  return s;
}

/** Seconds of training time: from the first ACTIVE until now (or completion), excluding pauses. */
export function elapsedSec(s: WorkoutState, now: number) {
  if (!s.firstActiveAt) return 0;
  const end = s.completedAt ?? (s.phase === "paused" ? (s.pausedAt ?? now) : now);
  return Math.max(0, Math.round((end - s.firstActiveAt - s.pausedMs) / 1000));
}

export function toWorkoutInput(s: WorkoutState): WorkoutInput {
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);
  return {
    exercise: s.plan.exercise,
    sets: Math.max(1, s.repsBySet.length),
    targetReps: s.plan.targetReps,
    reps: s.repsBySet.reduce((a, b) => a + b, 0),
    durationSec: elapsedSec(s, s.completedAt ?? Date.now()),
    avgDepthDeg: avg(s.perRep.map((r) => r.depth)),
    avgTempoSec: avg(s.perRep.map((r) => r.tempo)),
    perRep: s.perRep.slice(0, 500),
  };
}
