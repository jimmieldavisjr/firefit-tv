import { describe, expect, it } from "vitest";
import fixture from "../../../fixtures/session-full.json";
import { DEFAULT_SESSION, Plan, SessionPlan, WorkoutInput } from "./index";

describe("WorkoutInput", () => {
  it("accepts the three-exercise session fixture", () => {
    const w = WorkoutInput.parse(fixture);
    expect(w.blocks.map((b) => b.exercise)).toEqual(["squat", "pushup", "plank"]);
  });

  it("rejects unknown exercises, negative counts and oversized cues", () => {
    const bad = (patch: object) => WorkoutInput.safeParse({ ...fixture, blocks: [{ ...fixture.blocks[0], ...patch }] }).success;
    expect(bad({ exercise: "burpee" })).toBe(false);
    expect(bad({ perSet: [-1] })).toBe(false);
    expect(bad({ perRep: [{ depth: 90, tempo: 2, cue: "x".repeat(81) }] })).toBe(false);
  });
});

describe("plans", () => {
  it("the default session is squats, push-ups, plank", () => {
    expect(SessionPlan.parse(DEFAULT_SESSION).blocks.map((b) => b.exercise)).toEqual(["squat", "pushup", "plank"]);
  });

  it("Plan requires one of the four decisions", () => {
    const ok = { decision: "progress", recap: "Done.", insights: ["Squats: 30/30."], next: DEFAULT_SESSION, focusCue: "Knees out", reason: "Targets met." };
    expect(Plan.parse(ok).decision).toBe("progress");
    expect(Plan.safeParse({ ...ok, decision: "rest-day" }).success).toBe(false);
  });
});
