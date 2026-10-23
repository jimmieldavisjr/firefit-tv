import { describe, expect, it } from "vitest";
import { guard, rulesPlan, trends, type Workout } from "../src/trends";

const w = (over: Partial<Workout> = {}): Workout => ({
  id: "w1",
  completedAt: "2026-10-23T00:00:00.000Z",
  exercise: "squat",
  sets: 2,
  targetReps: 5,
  reps: 10,
  durationSec: 120,
  avgDepthDeg: 95,
  avgTempoSec: 2,
  perRep: Array.from({ length: 10 }, () => ({ depth: 95, tempo: 2 })),
  ...over,
});

describe("trends", () => {
  it("computes target, cue rate and top cue for the newest session", () => {
    const cueReps = [
      { depth: 100, tempo: 2, cue: "Knees out" },
      { depth: 100, tempo: 2, cue: "Knees out" },
      { depth: 100, tempo: 2, cue: "Hips back" },
    ];
    const t = trends([w({ perRep: [...cueReps, ...Array.from({ length: 7 }, () => ({ depth: 95, tempo: 2 }))] })]);
    expect(t.targetMet).toBe(true);
    expect(t.cueRate).toBe(0.3);
    expect(t.topCue).toBe("Knees out");
    expect(t.sessionsCompared).toBe(0);
    expect(t.repsChangePct).toBeNull();
  });

  it("compares against earlier sessions", () => {
    const t = trends([w({ reps: 6 }), w({ reps: 10, avgDepthDeg: 100 }), w({ reps: 10, avgDepthDeg: 100 })]);
    expect(t.repsChangePct).toBe(-40);
    expect(t.depthChangeDeg).toBe(-5);
  });
});

describe("rulesPlan", () => {
  it("progresses by +2 reps when the target is met with clean form", () => {
    const last = w();
    const p = rulesPlan(trends([last]), last);
    expect(p.decision).toBe("progress");
    expect(p.nextWorkout.targetReps).toBe(7);
  });

  it("chooses technique when cues appear on 30%+ of reps", () => {
    const last = w({ perRep: Array.from({ length: 10 }, (_, i) => ({ depth: 95, tempo: 2, cue: i < 4 ? "Knees out" : undefined })) });
    const p = rulesPlan(trends([last]), last);
    expect(p.decision).toBe("technique");
    expect(p.focusCue).toBe("Knees out");
    expect(p.nextWorkout.targetReps).toBe(5);
  });

  it("deloads when reps drop more than 20%", () => {
    const last = w({ reps: 6 });
    const p = rulesPlan(trends([last, w(), w()]), last);
    expect(p.decision).toBe("deload");
    expect(p.nextWorkout.targetReps).toBe(3);
  });

  it("holds when the target is missed", () => {
    const last = w({ reps: 9 });
    expect(rulesPlan(trends([last]), last).decision).toBe("hold");
  });
});

describe("guard", () => {
  it("clamps sets, reps (+2 max) and rest", () => {
    const p = guard(
      {
        decision: "progress",
        recap: "",
        focusCue: "",
        reason: "",
        nextWorkout: { exercise: "squat", sets: 9, targetReps: 30, restSec: 5 },
      },
      { targetReps: 5 },
    );
    expect(p.nextWorkout).toEqual({ exercise: "squat", sets: 5, targetReps: 7, restSec: 30 });
  });
});
