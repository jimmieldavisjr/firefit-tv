import { describe, expect, it } from "vitest";
import { WorkoutInput } from "@firefit/shared";
import {
  calorieBreakdown,
  caloriesEst,
  elapsedSec,
  initSession,
  READY_HOLD_MS,
  sessionReducer,
  setProgress,
  toWorkoutInput,
  TRANSITION_SEC,
  type SessionEvent,
  type SessionState,
} from "./workout";

const plan = [
  { exercise: "squat" as const, sets: 2, target: 3, restSec: 45 },
  { exercise: "pushup" as const, sets: 1, target: 2, restSec: 45 },
  { exercise: "plank" as const, sets: 1, target: 30, restSec: 30 },
];
const rep = (at = 0) => ({ depth: 95, tempo: 2, at });
const run = (s: SessionState, ...events: SessionEvent[]) => events.reduce(sessionReducer, s);
const ready = (s: SessionState, t: number) => run(s, { type: "visible", visible: true, now: t }, { type: "visible", visible: true, now: t + READY_HOLD_MS });

describe("session state machine", () => {
  it("starts only after the full body is visible for 2 s", () => {
    let s = run(initSession(plan), { type: "visible", visible: true, now: 0 }, { type: "visible", visible: true, now: 1500 });
    expect(s.phase).toBe("ready");
    s = run(s, { type: "visible", visible: false, now: 1600 }, { type: "visible", visible: true, now: 1700 }, { type: "visible", visible: true, now: 3600 });
    expect(s.phase).toBe("ready");
    expect(run(s, { type: "visible", visible: true, now: 3700 }).phase).toBe("active");
  });

  it("runs squats -> rest -> squats -> transition -> push-ups -> transition -> plank -> complete", () => {
    let s = ready(initSession(plan), 0);
    s = run(s, { type: "rep", rep: rep(1000), now: 3000 }, { type: "rep", rep: rep(3000), now: 5000 }, { type: "rep", rep: rep(5000), now: 7000 });
    expect([s.phase, s.set]).toEqual(["rest", 1]);
    s = run(s, { type: "tick", now: 7000 + 45_000 });
    expect([s.phase, s.set]).toEqual(["active", 2]);
    s = run(s, { type: "rep", rep: rep(), now: 60_000 }, { type: "rep", rep: rep(), now: 62_000 }, { type: "rep", rep: rep(), now: 64_000 });
    expect(s.phase).toBe("transition");
    s = run(s, { type: "tick", now: 64_000 + TRANSITION_SEC * 1000 });
    expect([s.phase, s.block, s.set]).toEqual(["ready", 1, 1]); // must be seen again after moving the phone
    s = ready(s, 110_000);
    s = run(s, { type: "rep", rep: rep(), now: 115_000 }, { type: "rep", rep: rep(), now: 117_000 });
    expect([s.phase, s.block]).toEqual(["transition", 1]);
    s = ready(run(s, { type: "select", now: 118_000 }), 119_000); // Select skips the transition
    expect([s.phase, s.block]).toEqual(["active", 2]);
    s = run(s, { type: "hold", holdMs: 12_000, good: true, now: 133_000 });
    expect(setProgress(s)).toBe(12);
    s = run(s, { type: "hold", holdMs: 30_000, good: true, now: 152_000 });
    expect(s.phase).toBe("complete");
    expect(s.logs.map((l) => l.perSet)).toEqual([[3, 3], [2], [30]]);
  });

  it("ignores reps during the plank and hold updates during squats", () => {
    let s = ready(initSession(plan), 0);
    s = run(s, { type: "hold", holdMs: 9000, good: true, now: 3000 });
    expect([s.holdMs, s.setReps]).toEqual([0, 0]);
    const plankOnly = ready(initSession([plan[2]]), 0);
    expect(run(plankOnly, { type: "rep", rep: rep(), now: 3000 }).setReps).toBe(0);
  });

  it("Select ends a set early and skips rest", () => {
    let s = run(ready(initSession(plan), 0), { type: "rep", rep: rep(), now: 3000 }, { type: "select", now: 4000 });
    expect([s.phase, s.logs[0].perSet]).toEqual(["rest", [1]]);
    s = run(s, { type: "select", now: 5000 });
    expect([s.phase, s.set]).toEqual(["active", 2]);
  });

  it("pause freezes rest, set and session time", () => {
    let s = run(ready(initSession(plan), 0), { type: "select", now: 10_000 }); // rest ends at 55 s
    s = run(s, { type: "playpause", now: 20_000 }, { type: "tick", now: 60_000 }, { type: "playpause", now: 80_000 });
    expect([s.phase, s.restEndsAt]).toEqual(["rest", 115_000]);
    expect(elapsedSec(s, 80_000)).toBe(18);
  });

  it("estimates calories from work the camera saw, with the rest of the session at standing MET", () => {
    let s = ready(initSession([{ exercise: "squat", sets: 2, target: 12, restSec: 45 }]), 0); // active from 2 s
    // 12 squats, one every 5 s, end the set at 62 s: 60 s of work (12 x 5 s cap); squats MET 5.0 at 80 kg = 7 kcal/min
    for (let i = 1; i <= 12; i++) s = run(s, { type: "rep", rep: rep(i * 5000), now: 2000 + i * 5000 });
    expect(calorieBreakdown(s, 62_000, 80).workSec).toBe(60);
    expect(caloriesEst(s, 62_000, 80)).toBe(7);
    expect(caloriesEst(s, 62_000, 100)).toBe(9); // scales with body weight (8.75 rounds to 9)
    // a minute of standing rest adds MET 1.3: 1.3 * 3.5 * 80 / 200 = 1.82 kcal
    expect(calorieBreakdown(s, 122_000, 80).kcal).toBeCloseTo(7 + 1.82, 1);
  });

  it("does not credit idle time inside a set as exercise", () => {
    let s = ready(initSession(plan), 0);
    s = run(s, { type: "rep", rep: rep(2500), now: 5000 }, { type: "select", now: 62_000 }); // 1 squat, 60 s set
    const b = calorieBreakdown(s, 62_000, 80);
    expect(b.workSec).toBe(5);
    expect(b.restSec).toBe(55);
  });

  it("builds a valid WorkoutInput with per-set data and time between reps", () => {
    let s = ready(initSession(plan), 0);
    s = run(s, { type: "rep", rep: { ...rep(800), cue: "Push your knees out over your toes" }, now: 3000 }, { type: "rep", rep: rep(3100), now: 5000 }, { type: "select", now: 6000 });
    s = run(s, { type: "select", now: 7000 }, { type: "select", now: 8000 }); // skip rest, end set 2 -> transition
    s = run(s, { type: "select", now: 9000 }, { type: "select", now: 9500 }, { type: "select", now: 10_000 }); // push-ups: start, end
    s = run(s, { type: "select", now: 11_000 }, { type: "select", now: 11_500 }, { type: "hold", holdMs: 30_000, good: true, now: 42_000 });
    expect(s.phase).toBe("complete");
    const w = WorkoutInput.parse(toWorkoutInput(s, 80));
    expect(w.blocks.map((b) => b.exercise)).toEqual(["squat", "pushup", "plank"]);
    expect(w.blocks[0]).toMatchObject({ setsDone: 2, perSet: [2, 0], cues: ["Push your knees out over your toes"] });
    expect(w.blocks[0].perRep[1].at! - w.blocks[0].perRep[0].at!).toBe(2300);
    expect(w.blocks[2].perSet).toEqual([30]);
    expect(w.caloriesEst).toBeGreaterThan(0);
  });
});
