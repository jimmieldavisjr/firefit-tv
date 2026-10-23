import { describe, expect, it } from "vitest";
import fixture from "../../../fixtures/squat-3x10.json";
import { Plan, WorkoutInput } from "./index";

describe("WorkoutInput", () => {
  it("accepts the squat fixture", () => {
    expect(WorkoutInput.parse(fixture).reps).toBe(30);
  });

  it("rejects unknown exercises, negative reps and oversized cues", () => {
    expect(WorkoutInput.safeParse({ ...fixture, exercise: "burpee" }).success).toBe(false);
    expect(WorkoutInput.safeParse({ ...fixture, reps: -1 }).success).toBe(false);
    expect(WorkoutInput.safeParse({ ...fixture, perRep: [{ depth: 90, tempo: 2, cue: "x".repeat(81) }] }).success).toBe(false);
  });
});

describe("Plan", () => {
  it("requires one of the four decisions", () => {
    const ok = {
      decision: "progress",
      recap: "30 of 30 reps.",
      nextWorkout: { exercise: "squat", sets: 3, targetReps: 12, restSec: 60 },
      focusCue: "Knees out",
      reason: "Target met.",
    };
    expect(Plan.parse(ok).decision).toBe("progress");
    expect(Plan.safeParse({ ...ok, decision: "rest-day" }).success).toBe(false);
  });
});
