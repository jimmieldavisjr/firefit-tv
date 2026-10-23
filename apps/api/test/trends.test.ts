import { describe, expect, it } from "vitest";
import fixture from "../../../fixtures/session-full.json";
import { blockStats, guard, normalize, repIntervals, rulesPlan, trends, type Session } from "../src/trends";

const session = (over: Partial<Session> = {}): Session => ({ ...(fixture as unknown as Session), id: "s1", completedAt: "2026-10-23T00:00:00Z", ...over });
const block = (i: number, patch: object) => {
  const s = session();
  s.blocks = s.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b));
  return s;
};
const clean = () => {
  const s = session();
  s.blocks = s.blocks.map((b) => ({ ...b, perSet: Array(b.sets).fill(b.target), cues: [], perRep: b.perRep.map(({ cue: _c, ...r }) => r) }));
  return s;
};

describe("stats", () => {
  it("computes seconds between reps within a set", () => {
    expect(repIntervals(fixture.blocks[0].perRep)).toEqual([2.9, 2.8]);
    const st = blockStats(fixture.blocks[0] as Session["blocks"][number]);
    expect(st).toMatchObject({ total: 30, targetMet: true, avgSecBetweenReps: 2.8, topCue: "Push your knees out over your toes" });
  });

  it("marks push-ups and plank as missed when a set fell short", () => {
    const t = trends([session()]);
    expect(t.blocks.map((b) => [b.exercise, b.targetMet])).toEqual([["squat", true], ["pushup", false], ["plank", false]]);
    expect(t.blocks[2]).toMatchObject({ unit: "sec", total: 82, targetTotal: 90 });
  });

  it("compares totals with earlier sessions per exercise", () => {
    const t = trends([block(1, { perSet: [4, 4, 4] }), session(), session()]);
    expect(t.blocks[1].totalChangePct).toBe(-43);
  });

  it("normalizes the older single-exercise records", () => {
    const s = normalize({ id: "o", completedAt: "x", exercise: "squat", sets: 2, targetReps: 5, reps: 10, durationSec: 60, perRep: [{ depth: 90, tempo: 2, cue: "Push your knees out over your toes" }] });
    expect(s?.blocks[0]).toMatchObject({ exercise: "squat", target: 5, perSet: [10], cues: ["Push your knees out over your toes"] });
  });
});

describe("rulesPlan", () => {
  it("progresses every exercise when all targets were met with clean form", () => {
    const p = rulesPlan(trends([clean()]), clean());
    expect(p.decision).toBe("progress");
    expect(p.next.blocks.map((b) => b.target)).toEqual([12, 10, 40]);
  });

  it("chooses technique when cues hit 30% of reps", () => {
    const p = rulesPlan(trends([session()]), session()); // squats: 1 cue in 3 recorded reps
    expect(p.decision).toBe("technique");
    expect(p.next.blocks.map((b) => b.target)).toEqual([10, 8, 30]);
    expect(p.insights.length).toBe(3);
  });

  it("deloads when an exercise dropped more than 20%", () => {
    const low = clean();
    low.blocks[1] = { ...low.blocks[1], perSet: [3, 3, 3] };
    const p = rulesPlan(trends([low, clean(), clean()]), low);
    expect(p.decision).toBe("deload");
    expect(p.next.blocks[1].target).toBe(6);
  });
});

describe("guard", () => {
  const base = { decision: "progress" as const, recap: "", insights: [], focusCue: "", reason: "" };

  it("keeps the three exercises in order and clamps targets", () => {
    const p = guard({ ...base, next: { blocks: [{ exercise: "plank", sets: 9, target: 500, restSec: 1 }] } }, clean());
    expect(p.next.blocks.map((b) => b.exercise)).toEqual(["squat", "pushup", "plank"]);
    expect(p.next.blocks[2]).toEqual({ exercise: "plank", sets: 4, target: 40, restSec: 20 });
  });

  it("forces progress on met targets only, and hold to keep targets", () => {
    const unchanged = { blocks: [{ exercise: "squat" as const, sets: 3, target: 10, restSec: 45 }, { exercise: "pushup" as const, sets: 3, target: 9, restSec: 45 }] };
    const p = guard({ ...base, next: unchanged }, session());
    expect(p.next.blocks.map((b) => b.target)).toEqual([12, 8, 30]); // squats met -> raised; push-ups missed -> capped at 8
    const h = guard({ ...base, decision: "hold", next: { blocks: [{ exercise: "squat", sets: 3, target: 14, restSec: 45 }] } }, session());
    expect(h.next.blocks[0].target).toBe(10);
  });

  it("technique uses the most common cue", () => {
    const p = guard({ ...base, decision: "technique", focusCue: "Breathe", next: { blocks: [] } }, session(), "Push your knees out over your toes");
    expect(p.focusCue).toBe("Push your knees out over your toes");
  });
});
