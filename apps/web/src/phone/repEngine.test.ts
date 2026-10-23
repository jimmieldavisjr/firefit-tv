import { describe, expect, it } from "vitest";
import { angle3, HOLD, LOST_RESET_MS, RepEngine, type P2V, type P3 } from "./repEngine";

// Synthetic squat pose: hip/knee/ankle placed so the knee angle equals `deg`.
// Knees wider than ankles so the knees-caving cue stays off unless asked for.
function pose(deg: number, opts: { vis?: number; caving?: boolean } = {}): { img: P2V[]; world: P3[] } {
  const rad = (deg * Math.PI) / 180;
  const world: P3[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
  const img: P2V[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: opts.vis ?? 0.99 }));
  for (const [hip, knee, ankle, sx] of [[23, 25, 27, -1], [24, 26, 28, 1]] as const) {
    world[knee] = { x: 0.15 * sx, y: 0, z: 0 };
    world[ankle] = { x: 0.15 * sx, y: 0.45, z: 0 }; // shin straight down
    // place hip on a circle around the knee so angle(hip, knee, ankle) == deg
    world[hip] = { x: 0.15 * sx + 0.45 * Math.sin(rad), y: 0.45 * Math.cos(rad), z: 0 };
    img[knee] = { ...img[knee], x: 0.5 + sx * (opts.caving ? 0.02 : 0.12) };
    img[ankle] = { ...img[ankle], x: 0.5 + sx * 0.1 };
  }
  return { img, world };
}

/** Feeds `frames` frames at `deg`, 33 ms apart, starting at time t. Returns the new time. */
function feed(e: RepEngine, deg: number, frames: number, t: number, opts?: Parameters<typeof pose>[1]) {
  for (let i = 0; i < frames; i++) {
    const { img, world } = pose(deg, opts);
    e.update(img, world, (t += 33));
  }
  return t;
}

function squat(e: RepEngine, t: number, bottom = 90, opts?: Parameters<typeof pose>[1]) {
  t = feed(e, 175, 10, t);
  t = feed(e, 130, 5, t);
  t = feed(e, bottom, 10, t, opts);
  t = feed(e, 130, 5, t);
  return feed(e, 175, 10, t);
}

describe("angle3", () => {
  it("measures the angle at the middle point", () => {
    expect(angle3({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBeCloseTo(90);
    expect(angle3({ x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeCloseTo(180);
  });

  it("the synthetic pose produces the requested knee angle", () => {
    const { world } = pose(100);
    expect(angle3(world[23], world[25], world[27])).toBeCloseTo(100, 0);
  });
});

describe("RepEngine (squat)", () => {
  it("counts 10 full squats as 10 reps", () => {
    const e = new RepEngine("squat");
    let t = 0;
    for (let i = 0; i < 10; i++) t = squat(e, t);
    expect(e.reps).toBe(10);
    expect(e.log).toHaveLength(10);
    expect(e.log[0].depth).toBeLessThanOrEqual(105);
    expect(e.log[0].tempo).toBeGreaterThan(0);
  });

  it("does not count half squats", () => {
    const e = new RepEngine("squat");
    let t = 0;
    for (let i = 0; i < 5; i++) t = squat(e, t, 125);
    expect(e.reps).toBe(0);
  });

  it("ignores single-frame spikes (needs HOLD consecutive frames)", () => {
    const e = new RepEngine("squat");
    let t = feed(e, 175, 10, 0);
    for (let i = 0; i < 5; i++) {
      t = feed(e, 60, HOLD - 2, t); // too short to register as "down" even after smoothing
      t = feed(e, 175, 5, t);
    }
    expect(e.reps).toBe(0);
  });

  it("does not count while landmarks are low-visibility", () => {
    const e = new RepEngine("squat");
    let t = 0;
    for (let i = 0; i < 3; i++) t = squat(e, t, 90, { vis: 0.3 });
    expect(e.reps).toBe(0);
  });

  it("reports lost and abandons a half-finished rep after a long tracking gap", () => {
    const e = new RepEngine("squat");
    let t = feed(e, 175, 10, 0);
    t = feed(e, 90, 10, t); // reached the bottom
    expect(e.stage).toBe("down");
    for (let i = 0; i < 60; i++) expect(e.lost((t += 33)).stage).toBe("lost"); // ~2 s out of frame
    expect(t).toBeGreaterThan(LOST_RESET_MS);
    feed(e, 175, 10, t); // stands back up in frame
    expect(e.reps).toBe(0);
  });

  it("flags knees caving inward and records the cue on the rep", () => {
    const reps: string[] = [];
    const e = new RepEngine("squat", (r) => r.cue && reps.push(r.cue));
    squat(e, 0, 90, { caving: true });
    expect(e.reps).toBe(1);
    expect(reps[0]).toMatch(/knees/i);
  });

  it("reset clears reps and the per-rep log", () => {
    const e = new RepEngine("squat");
    squat(e, 0);
    e.reset();
    expect([e.reps, e.log.length, e.stage]).toEqual([0, 0, "up"]);
  });
});
