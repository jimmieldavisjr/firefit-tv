// Deterministic numbers for the agent's analyze_trends tool, plus the rules fallback and guardrails.
// The model never does arithmetic: it reasons over what this file computes.
import { DEFAULT_SESSION, durationWords, EXERCISE_INFO } from "@firefit/shared/programs";
import type { BlockPlan, BlockResult, Decision, Exercise, Plan, Rep, WorkoutInput } from "@firefit/shared";

export type Session = WorkoutInput & { id: string; completedAt: string };

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs: number[]) => {
  const m = avg(xs);
  return Math.sqrt(avg(xs.map((x) => (x - m) ** 2)));
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Accepts current session items and the single-exercise items written before the three-exercise session. */
export function normalize(item: Record<string, unknown>): Session | null {
  if (Array.isArray(item.blocks)) return item as unknown as Session;
  if (typeof item.exercise !== "string") return null;
  const old = item as { id: string; completedAt: string; exercise: Exercise; sets: number; targetReps: number; reps: number; durationSec: number; perRep?: Rep[] };
  const perRep = old.perRep ?? [];
  return {
    id: old.id,
    completedAt: old.completedAt,
    plan: "full-body",
    blocks: [{ exercise: old.exercise, sets: old.sets, target: old.targetReps, setsDone: old.sets, perSet: [old.reps], setSec: [], perRep, cues: perRep.flatMap((r) => (r.cue ? [r.cue] : [])) }],
    durationSec: old.durationSec,
    activeSec: old.durationSec,
    caloriesEst: 0,
    bodyWeightKg: 80,
  };
}

/** Seconds between consecutive reps inside each set (rep.at restarts at each set). */
export function repIntervals(perRep: Rep[]) {
  const out: number[] = [];
  for (let i = 1; i < perRep.length; i++) {
    const a = perRep[i - 1].at, b = perRep[i].at;
    if (a !== undefined && b !== undefined && b > a) out.push((b - a) / 1000);
  }
  return out;
}

export function blockStats(b: BlockResult) {
  const unit = EXERCISE_INFO[b.exercise].unit;
  const counts = new Map<string, number>();
  for (const c of b.cues) counts.set(c, (counts.get(c) ?? 0) + 1);
  const intervals = repIntervals(b.perRep);
  const total = sum(b.perSet);
  return {
    exercise: b.exercise,
    unit,
    sets: b.sets,
    setsDone: b.setsDone,
    target: b.target,
    perSet: b.perSet,
    total,
    targetTotal: b.sets * b.target,
    completionPct: Math.round((100 * total) / Math.max(1, b.sets * b.target)),
    targetMet: b.setsDone >= b.sets && b.perSet.every((n) => n >= b.target),
    cueRate: unit === "reps" ? r1(b.cues.length / Math.max(1, b.perRep.length)) : r1(Math.min(1, b.cues.length / Math.max(1, b.setsDone * 3))),
    topCue: [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
    avgDepthDeg: b.perRep.length ? Math.round(avg(b.perRep.map((r) => r.depth))) : null,
    avgTempoSec: b.perRep.length ? r1(avg(b.perRep.map((r) => r.tempo))) : null,
    tempoSdSec: b.perRep.length ? r1(sd(b.perRep.map((r) => r.tempo))) : null,
    avgSecBetweenReps: intervals.length ? r1(avg(intervals)) : null,
    avgSetSec: b.setSec.length ? Math.round(avg(b.setSec)) : null,
  };
}
export type BlockStats = ReturnType<typeof blockStats>;

/** Stats for the newest session (first element) versus the earlier ones, per exercise. */
export function trends([cur, ...prev]: Session[]) {
  const blocks = cur.blocks.map((b) => {
    const s = blockStats(b);
    const earlier = prev.flatMap((p) => p.blocks.filter((x) => x.exercise === b.exercise).map((x) => sum(x.perSet)));
    const prevAvg = avg(earlier);
    return { ...s, sessionsCompared: earlier.length, totalChangePct: earlier.length && prevAvg ? Math.round((100 * (s.total - prevAvg)) / prevAvg) : null };
  });
  return {
    totalSessionSec: cur.durationSec,
    totalSessionTime: durationWords(cur.durationSec), // say this, not the raw seconds
    timeUnderWorkSec: cur.activeSec,
    restAndSetupSec: Math.max(0, cur.durationSec - cur.activeSec),
    caloriesEst: cur.caloriesEst,
    caloriesNote: `estimate from MET values and ${cur.bodyWeightKg} kg body weight`,
    blocks,
  };
}
export type Trends = ReturnType<typeof trends>;

const STEP: Record<Exercise, number> = { squat: 2, pushup: 2, plank: 5 };
const LIMITS: Record<Exercise, [number, number]> = { squat: [3, 30], pushup: [3, 30], plank: [5, 120] };

/** The plan the user just did, as the base for the next one (default session when unknown). */
export function lastPlan(s: Session | undefined): BlockPlan[] {
  return DEFAULT_SESSION.blocks.map((d) => {
    const b = s?.blocks.find((x) => x.exercise === d.exercise);
    return b ? { exercise: d.exercise, sets: b.sets, target: b.target, restSec: d.restSec } : d;
  });
}

/** Same output shape as the agent, so the TV never cares which one answered. */
export function rulesPlan(t: Trends, last: Session): Plan {
  const anyTechnique = t.blocks.some((b) => b.cueRate >= 0.3);
  const anyDeload = t.blocks.some((b) => b.totalChangePct !== null && b.totalChangePct < -20);
  const allMet = t.blocks.length > 0 && t.blocks.every((b) => b.targetMet);
  const decision: Decision = anyTechnique ? "technique" : anyDeload ? "deload" : allMet ? "progress" : "hold";
  const base = lastPlan(last);
  const next = base.map((b) => {
    const st = t.blocks.find((x) => x.exercise === b.exercise);
    const step = STEP[b.exercise];
    const target = decision === "progress" && st?.targetMet ? b.target + step : decision === "deload" ? b.target - step : b.target;
    return { ...b, target };
  });
  const topCue = t.blocks.map((b) => b.topCue).find(Boolean) ?? null;
  const insights = t.blocks.map((b) => {
    const name = EXERCISE_INFO[b.exercise].plural;
    if (b.unit === "sec") return `${name}: held ${b.total} of ${b.targetTotal} seconds${b.topCue ? `; most common cue: ${b.topCue.toLowerCase()}` : ""}.`;
    return `${name}: ${b.total} of ${b.targetTotal} reps${b.avgSecBetweenReps !== null ? `, ${b.avgSecBetweenReps}s between reps` : ""}${b.topCue ? `; watch: ${b.topCue.toLowerCase()}` : ""}.`;
  });
  const wentWell = t.blocks
    .filter((b) => b.targetMet || b.cueRate < 0.2)
    .slice(0, 2)
    .map((b) =>
      b.unit === "sec"
        ? `${EXERCISE_INFO[b.exercise].plural}: you held ${b.total} of ${b.targetTotal} seconds.`
        : `${EXERCISE_INFO[b.exercise].plural}: ${b.total} of ${b.targetTotal} reps${b.avgDepthDeg !== null ? ` at an average depth of ${b.avgDepthDeg} degrees` : ""}.`,
    );
  const toFix = t.blocks
    .filter((b) => !b.targetMet || b.cueRate >= 0.2)
    .sort((x, y) => y.cueRate - x.cueRate || x.completionPct - y.completionPct)
    .slice(0, 2)
    .map((b) => `${EXERCISE_INFO[b.exercise].plural}: ${b.topCue ? b.topCue.toLowerCase() : `${b.completionPct}% of the target`}.`);
  const nextTime = `Next time: ${next.map((b) => `${EXERCISE_INFO[b.exercise].plural.toLowerCase()} ${b.sets} by ${b.target}${b.exercise === "plank" ? " seconds" : ""}`).join(", ")}.`;
  return guard(
    {
      decision,
      recap: `${t.blocks.length} exercises in ${durationWords(t.totalSessionSec)}, about ${t.caloriesEst} kcal (estimate).`,
      insights,
      wentWell: wentWell.length ? wentWell : ["You finished the session. That's the habit that matters most."],
      toFix: toFix.length ? toFix : ["Keep the same smooth tempo on every rep."],
      nextTime,
      next: { blocks: next },
      focusCue: topCue ?? "Move with control",
      reason: `Rule-based decision: ${decision}.`,
    },
    last,
    topCue,
  );
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

/** The model proposes; code enforces limits a beginner program should never cross, keeps the three exercises in
 *  order, and makes the targets agree with the decision (a "progress" that changes nothing would be decorative). */
export function guard(p: Plan, last: Session | undefined, topCue?: string | null): Plan {
  const base = lastPlan(last);
  const met = new Set(last ? last.blocks.filter((b) => blockStats(b).targetMet).map((b) => b.exercise) : []);
  const blocks = base.map((b) => {
    const proposed = p.next.blocks.find((x) => x.exercise === b.exercise) ?? b;
    const [lo, hi] = LIMITS[b.exercise];
    const step = STEP[b.exercise];
    let target = clamp(proposed.target, lo, Math.min(hi, b.target + step));
    if (p.decision === "hold" || p.decision === "technique") target = b.target;
    if (p.decision === "deload" && target >= b.target) target = Math.max(lo, b.target - step);
    if (p.decision === "progress" && met.has(b.exercise) && target <= b.target) target = Math.min(hi, b.target + step);
    if (p.decision === "progress" && !met.has(b.exercise)) target = Math.min(target, b.target); // only progress what was met
    return { exercise: b.exercise, sets: clamp(proposed.sets, 1, 4), target, restSec: clamp(proposed.restSec, 20, 120) };
  });
  const focusCue = (p.decision === "technique" && topCue ? topCue : p.focusCue).trim().slice(0, 120) || topCue || "Move with control";
  const say = (s: string) => humanDurations(s);
  return {
    ...p,
    recap: say(p.recap),
    focusCue,
    insights: p.insights.slice(0, 5).map(say),
    wentWell: p.wentWell.slice(0, 3).map(say),
    toFix: p.toFix.slice(0, 3).map(say),
    nextTime: say(p.nextTime),
    next: { blocks },
  };
}

/** Any duration of a minute or more written as raw seconds ("339 sec", "339s", "339 seconds") becomes minutes and seconds. */
export function humanDurations(text: string): string {
  return text.replace(/\b(\d{2,5})\s*(?:seconds?|secs?|s)\b/gi, (whole, n: string) => (Number(n) >= 60 ? durationWords(Number(n)) : whole));
}
