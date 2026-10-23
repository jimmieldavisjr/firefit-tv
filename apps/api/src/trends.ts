// Deterministic numbers for the agent's analyze_trends tool, plus the rules fallback.
// The model never does arithmetic: it reasons over what this file computes.
import type { Decision, Plan, Rep, WorkoutInput } from "@firefit/shared";

export type Workout = WorkoutInput & { id: string; completedAt: string; perRep: Rep[] };

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs: number[]) => {
  const m = avg(xs);
  return Math.sqrt(avg(xs.map((x) => (x - m) ** 2)));
};
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Stats for the newest session (first element) versus the earlier ones. */
export function trends([cur, ...prev]: Workout[]) {
  const cues = cur.perRep.map((r) => r.cue).filter((c): c is string => !!c);
  const counts = new Map<string, number>();
  for (const c of cues) counts.set(c, (counts.get(c) ?? 0) + 1);
  const topCue = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const prevReps = avg(prev.map((w) => w.reps));
  const target = cur.sets * cur.targetReps;
  return {
    exercise: cur.exercise,
    reps: cur.reps,
    target,
    targetMet: cur.reps >= target,
    avgDepthDeg: cur.avgDepthDeg,
    tempoSdSec: r1(sd(cur.perRep.map((r) => r.tempo))),
    cueRate: r1(cues.length / Math.max(1, cur.perRep.length)),
    topCue,
    sessionsCompared: prev.length,
    repsChangePct: prev.length && prevReps ? Math.round((100 * (cur.reps - prevReps)) / prevReps) : null,
    depthChangeDeg: prev.length ? r1(cur.avgDepthDeg - avg(prev.map((w) => w.avgDepthDeg))) : null,
  };
}
export type Trends = ReturnType<typeof trends>;

/** Same output shape as the agent, so the TV never cares which one answered. */
export function rulesPlan(t: Trends, last: Workout): Plan {
  const decision: Decision =
    t.cueRate >= 0.3
      ? "technique"
      : t.repsChangePct !== null && t.repsChangePct < -20
        ? "deload"
        : t.targetMet
          ? "progress"
          : "hold";
  const targetReps =
    decision === "progress"
      ? last.targetReps + 2
      : decision === "deload"
        ? Math.max(3, last.targetReps - 2)
        : last.targetReps;
  return guard(
    {
      decision,
      recap: `${t.reps} of ${t.target} reps at an average depth of ${t.avgDepthDeg} degrees.`,
      nextWorkout: { exercise: last.exercise, sets: last.sets, targetReps, restSec: 60 },
      focusCue: t.topCue ?? CUES[last.exercise].fallback,
      reason: `Rule-based decision: ${decision}.`,
    },
    last,
    t.topCue,
  );
}

// Form cues the phone can raise, per exercise; anything else from the model is replaced with a safe default.
export const CUES: Record<Workout["exercise"], { known: string[]; fallback: string }> = {
  squat: { known: ["Push your knees out over your toes"], fallback: "Sit back and keep your chest up" },
  pushup: { known: ["Keep your hips in line"], fallback: "Keep your body in one straight line" },
};
const otherCues = (ex: Workout["exercise"]) =>
  Object.entries(CUES)
    .filter(([k]) => k !== ex)
    .flatMap(([, v]) => [...v.known, v.fallback]);

// The model proposes; code enforces limits a beginner program should never cross, and makes the targets
// agree with the decision (a "progress" that doesn't add reps would be decorative text, not coaching).
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));
export function guard(p: Plan, last: Pick<Workout, "targetReps" | "exercise">, topCue?: string | null): Plan {
  const n = p.nextWorkout;
  const maxReps = Math.min(20, last.targetReps + 2); // at most +2 reps per step
  let targetReps = clamp(n.targetReps, 3, maxReps);
  if (p.decision === "progress" && targetReps <= last.targetReps) targetReps = maxReps;
  if (p.decision === "hold" || p.decision === "technique") targetReps = last.targetReps;
  if (p.decision === "deload" && targetReps >= last.targetReps) targetReps = Math.max(3, last.targetReps - 2);

  const cueSet = CUES[last.exercise];
  let focusCue = p.focusCue.trim().slice(0, 120);
  if (p.decision === "technique" && topCue) focusCue = topCue;
  if (!focusCue || otherCues(last.exercise).some((c) => c.toLowerCase() === focusCue.toLowerCase())) focusCue = topCue ?? cueSet.fallback;

  return {
    ...p,
    focusCue,
    nextWorkout: {
      exercise: last.exercise, // the app plans one exercise at a time
      sets: clamp(n.sets, 1, 5),
      targetReps,
      restSec: clamp(n.restSec, 30, 120),
    },
  };
}
