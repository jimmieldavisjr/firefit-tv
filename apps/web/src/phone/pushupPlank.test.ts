import { describe, expect, it } from "vitest";
import { angle3, PlankEngine, RepEngine, torsoHorizontal, type P2V, type P3 } from "./repEngine";

const vis = (n = 0.9): P2V[] => Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: n }));
const blank = (): P3[] => Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));

/** Side-view push-up: body horizontal along +x, elbow angle = deg on both arms. */
function pushupPose(deg: number, opts: { standing?: boolean; hipDrop?: number } = {}) {
  const w = blank();
  const rad = (deg * Math.PI) / 180;
  const L = 0.3; // upper arm = forearm
  const d = Math.sqrt(2 * L * L * (1 - Math.cos(rad))); // shoulder-wrist distance
  const off = Math.sqrt(Math.max(0, L * L - (d / 2) ** 2));
  for (const [sh, el, wr, hip, ank, z] of [[11, 13, 15, 23, 27, -0.2], [12, 14, 16, 24, 28, 0.2]] as const) {
    if (opts.standing) {
      w[sh] = { x: 0, y: -0.5, z };
      w[hip] = { x: 0, y: 0, z };
      w[ank] = { x: 0, y: 0.9, z };
    } else {
      w[sh] = { x: 0, y: 0, z };
      w[hip] = { x: 0.5, y: opts.hipDrop ?? 0, z };
      w[ank] = { x: 1.3, y: 0, z };
    }
    w[wr] = { x: w[sh].x, y: w[sh].y + d, z };
    w[el] = { x: w[sh].x - off, y: w[sh].y + d / 2, z };
  }
  return { img: vis(), world: w };
}

function feed(e: RepEngine, deg: number, frames: number, t: number, opts?: Parameters<typeof pushupPose>[1]) {
  for (let i = 0; i < frames; i++) {
    const { img, world } = pushupPose(deg, opts);
    e.update(img, world, (t += 33));
  }
  return t;
}
const pushup = (e: RepEngine, t: number, bottom = 85, opts?: Parameters<typeof pushupPose>[1]) =>
  feed(e, 170, 8, feed(e, bottom, 10, feed(e, 170, 10, t, opts), opts), opts);

describe("push-up engine", () => {
  it("synthetic pose produces the requested elbow angle", () => {
    const { world } = pushupPose(95);
    expect(angle3(world[11], world[13], world[15])).toBeCloseTo(95, 0);
    expect(torsoHorizontal(world)).toBe(true);
    expect(torsoHorizontal(pushupPose(95, { standing: true }).world)).toBe(false);
  });

  it("counts 8 full push-ups and records time between reps", () => {
    const e = new RepEngine("pushup");
    let t = 0;
    for (let i = 0; i < 8; i++) t = pushup(e, t);
    expect(e.reps).toBe(8);
    expect(e.log[1].at! - e.log[0].at!).toBeGreaterThan(500);
  });

  it("counts reps that only reach 98° (forgiving 100° threshold)", () => {
    const e = new RepEngine("pushup");
    pushup(e, 0, 98);
    expect(e.reps).toBe(1);
  });

  it("ignores shallow push-ups", () => {
    const e = new RepEngine("pushup");
    let t = 0;
    for (let i = 0; i < 4; i++) t = pushup(e, t, 125);
    expect(e.reps).toBe(0);
  });

  it("never counts arm bends while standing", () => {
    const e = new RepEngine("pushup");
    let t = 0;
    for (let i = 0; i < 4; i++) t = pushup(e, t, 60, { standing: true });
    expect(e.reps).toBe(0);
    const { img, world } = pushupPose(60, { standing: true });
    expect(e.update(img, world, t + 33).stage).toBe("break");
  });

  it("flags sagging hips on the rep", () => {
    const cues: string[] = [];
    const e = new RepEngine("pushup", (r) => r.cue && cues.push(r.cue));
    pushup(e, 0, 85, { hipDrop: 0.25 });
    expect(e.reps).toBe(1);
    expect(cues[0]).toMatch(/hips/i);
  });
});

describe("plank engine", () => {
  const plankPose = (hipDrop: number, standing = false) => {
    const p = pushupPose(170, { hipDrop, standing });
    // image coords for the sag/pike cue: shoulder left, ankle right, hip offset by the drop
    p.img[11] = { x: 0.3, y: 0.5, visibility: 0.9 };
    p.img[27] = { x: 0.8, y: 0.5, visibility: 0.9 };
    p.img[23] = { x: 0.5, y: 0.5 + hipDrop / 2, visibility: 0.9 };
    return p;
  };

  it("accumulates hold time only while the body line is straight", () => {
    const e = new PlankEngine();
    let t = 0;
    for (let i = 0; i < 60; i++) e.update(plankPose(0).img, plankPose(0).world, (t += 50)); // ~3 s good
    const good = e.holdMs;
    expect(good).toBeGreaterThan(2800);
    let s = e.update(plankPose(0.3).img, plankPose(0.3).world, (t += 50));
    for (let i = 0; i < 40; i++) s = e.update(plankPose(0.3).img, plankPose(0.3).world, (t += 50)); // sagging
    expect(s.good).toBe(false);
    expect(s.cue).toMatch(/lift your hips/i);
    expect(e.holdMs - good).toBeLessThan(200); // smoothing lets at most a couple of frames through
  });

  it("detects a pike and asks to lower the hips", () => {
    const e = new PlankEngine();
    let s = e.update(plankPose(-0.3).img, plankPose(-0.3).world, 0);
    for (let i = 1; i < 10; i++) s = e.update(plankPose(-0.3).img, plankPose(-0.3).world, i * 50);
    expect(s.cue).toMatch(/lower your hips/i);
  });

  it("does not count time while standing, and caps tracking gaps", () => {
    const e = new PlankEngine();
    let t = 0;
    for (let i = 0; i < 40; i++) e.update(plankPose(0, true).img, plankPose(0, true).world, (t += 50));
    expect(e.holdMs).toBe(0);
    e.update(plankPose(0).img, plankPose(0).world, (t += 50));
    e.update(plankPose(0).img, plankPose(0).world, t + 5000); // a 5 s stall adds at most 250 ms
    expect(e.holdMs).toBeLessThanOrEqual(50 + 250); // one normal 50 ms frame + the capped gap
  });
});
