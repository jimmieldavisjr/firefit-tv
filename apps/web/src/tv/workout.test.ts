import { describe, expect, it } from "vitest";
import { WorkoutInput } from "@firefit/shared";
import { elapsedSec, initWorkout, READY_HOLD_MS, toWorkoutInput, workoutReducer, type WorkoutEvent, type WorkoutState } from "./workout";

const plan = { exercise: "squat" as const, sets: 2, targetReps: 3, restSec: 45 };
const rep = { depth: 95, tempo: 2 };
const run = (s: WorkoutState, ...events: WorkoutEvent[]) => events.reduce(workoutReducer, s);

function activeAt(t0: number) {
  return run(initWorkout(plan), { type: "visible", visible: true, now: t0 }, { type: "visible", visible: true, now: t0 + READY_HOLD_MS });
}

describe("workout state machine", () => {
  it("starts only after the full body is visible for 2 s", () => {
    let s = run(initWorkout(plan), { type: "visible", visible: true, now: 0 }, { type: "visible", visible: true, now: 1500 });
    expect(s.phase).toBe("ready");
    s = run(s, { type: "visible", visible: false, now: 1600 }, { type: "visible", visible: true, now: 1700 }, { type: "visible", visible: true, now: 3600 });
    expect(s.phase).toBe("ready"); // the timer restarted when tracking dropped
    s = run(s, { type: "visible", visible: true, now: 3700 });
    expect(s.phase).toBe("active");
  });

  it("Select starts immediately from READY", () => {
    expect(run(initWorkout(plan), { type: "select", now: 0 }).phase).toBe("active");
  });

  it("ignores reps outside ACTIVE", () => {
    const s = run(initWorkout(plan), { type: "rep", rep, now: 0 });
    expect([s.phase, s.setReps, s.perRep.length]).toEqual(["ready", 0, 0]);
  });

  it("finishes a set at the target, rests, then runs the next set to COMPLETE", () => {
    let s = activeAt(0);
    s = run(s, { type: "rep", rep, now: 3000 }, { type: "rep", rep, now: 5000 }, { type: "rep", rep, now: 7000 });
    expect(s.phase).toBe("rest");
    expect(s.repsBySet).toEqual([3]);
    s = run(s, { type: "tick", now: 7000 + 44_000 });
    expect(s.phase).toBe("rest");
    s = run(s, { type: "tick", now: 7000 + 45_000 });
    expect([s.phase, s.set, s.setReps]).toEqual(["active", 2, 0]);
    s = run(s, { type: "rep", rep, now: 60_000 }, { type: "rep", rep, now: 62_000 }, { type: "rep", rep, now: 64_000 });
    expect(s.phase).toBe("complete");
    expect(s.repsBySet).toEqual([3, 3]);
    expect(run(s, { type: "rep", rep, now: 70_000 }).perRep).toHaveLength(6); // frozen after COMPLETE
  });

  it("Select ends a set early and skips rest", () => {
    let s = run(activeAt(0), { type: "rep", rep, now: 3000 }, { type: "select", now: 4000 });
    expect([s.phase, s.repsBySet]).toEqual(["rest", [1]]);
    s = run(s, { type: "select", now: 5000 });
    expect([s.phase, s.set]).toEqual(["active", 2]);
  });

  it("pause freezes rest time and training time, then resumes where it left off", () => {
    let s = run(activeAt(0), { type: "select", now: 10_000 }); // rest ends at 55 s
    s = run(s, { type: "playpause", now: 20_000 });
    expect(s.phase).toBe("paused");
    s = run(s, { type: "rep", rep, now: 25_000 }, { type: "tick", now: 60_000 });
    expect(s.phase).toBe("paused"); // no reps, no rest expiry while paused
    s = run(s, { type: "playpause", now: 80_000 }); // 60 s away
    expect([s.phase, s.restEndsAt]).toEqual(["rest", 115_000]);
    expect(elapsedSec(s, 80_000)).toBe(18); // 80 s since start - 2 s ready - 60 s paused
  });

  it("builds a valid WorkoutInput for POST /workouts", () => {
    let s = activeAt(0);
    s = run(s, { type: "rep", rep: { depth: 90, tempo: 2 }, now: 3000 }, { type: "rep", rep: { depth: 100, tempo: 3, cue: "Knees out" }, now: 6000 });
    s = run(s, { type: "select", now: 7000 }, { type: "select", now: 8000 }, { type: "select", now: 9000 });
    expect(s.phase).toBe("complete");
    const w = toWorkoutInput(s);
    expect(WorkoutInput.parse(w)).toMatchObject({ sets: 2, reps: 2, targetReps: 3, avgDepthDeg: 95, avgTempoSec: 2.5 });
  });
});
