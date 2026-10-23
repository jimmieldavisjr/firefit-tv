// Deterministic, phone-authoritative exercise engines. No ML model decides whether a rep happened.
//   RepEngine (squat, push-up): a rep is an up -> down -> up cycle where each crossing holds for HOLD frames.
//   PlankEngine: accumulates hold time only while the body line is straight.
// Angles come from MediaPipe world landmarks (metric, 3D), so phone orientation and aspect ratio don't skew them.
import type { Exercise, Rep, Stage } from "@firefit/shared";

/** Minimal landmark shapes (structurally compatible with @mediapipe/tasks-vision). */
export type P3 = { x: number; y: number; z: number };
export type P2V = { x: number; y: number; visibility?: number };

// Landmark indices
const SH = [11, 12], EL = [13, 14], WR = [15, 16], HIP = [23, 24], KNEE = [25, 26], ANK = [27, 28];

export const CFG = {
  // squat: [hip, knee, ankle], facing the phone
  squat: { joints: [[HIP[0], KNEE[0], ANK[0]], [HIP[1], KNEE[1], ANK[1]]], down: 105, up: 160, minVis: 0.6, horizontal: false },
  // push-up: [shoulder, elbow, wrist], side view at floor level; forgiving thresholds, both arms averaged when visible
  pushup: { joints: [[SH[0], EL[0], WR[0]], [SH[1], EL[1], WR[1]]], down: 100, up: 150, minVis: 0.5, horizontal: true },
  // plank: [shoulder, hip, ankle] body line
  plank: { joints: [[SH[0], HIP[0], ANK[0]], [SH[1], HIP[1], ANK[1]]], down: 155, up: 160, minVis: 0.5, horizontal: true },
} as const satisfies Record<Exercise, unknown>;

export const HOLD = 3;
export const MIN_REP_MS = 600;
/** Tracking gaps longer than this abandon a half-finished rep instead of completing it later. */
export const LOST_RESET_MS = 1500;
/** Torso counts as horizontal (push-up/plank position) when its vertical extent is under this share of its length. */
export const HORIZONTAL_MAX = 0.65;
/** Plank: body-line angle at or above this counts as good form. */
export const PLANK_GOOD = 155;

export type EngineState = {
  reps: number;
  stage: Stage;
  angle: number;
  visible: boolean;
  flagged: number[];
  holdMs?: number;
  good?: boolean;
  cue?: string;
};

export function angle3(a: P3, b: P3, c: P3) {
  const u = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v = [c.x - b.x, c.y - b.y, c.z - b.z];
  const m = Math.hypot(...u) * Math.hypot(...v) || 1e-6;
  return (Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / m))) * 180) / Math.PI;
}

const mid = (a: P3, b: P3): P3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

/** True when the shoulders-to-hips line is closer to horizontal than vertical (push-up / plank position). */
export function torsoHorizontal(world: P3[]) {
  const s = mid(world[SH[0]], world[SH[1]]);
  const h = mid(world[HIP[0]], world[HIP[1]]);
  const len = Math.hypot(s.x - h.x, s.y - h.y, s.z - h.z) || 1e-6;
  return Math.abs(s.y - h.y) < HORIZONTAL_MAX * len;
}

/** Visibility of each side's joint triplet; the sides that clear the bar, best first. */
function usableSides(ex: Exercise, img: P2V[], world: P3[]) {
  const cfg = CFG[ex];
  const vis = cfg.joints.map((j) => (j.every((i) => world[i]) ? Math.min(...j.map((i) => img[i]?.visibility ?? 0)) : 0));
  return [0, 1].filter((s) => vis[s] >= cfg.minVis).sort((a, b) => vis[b] - vis[a]);
}

function jointAngle(ex: Exercise, sides: number[], world: P3[]) {
  const js = CFG[ex].joints;
  // both arms (or legs) visible: average them, which steadies the side-view far arm and front views alike
  const angles = sides.map((s) => {
    const [a, b, c] = js[s].map((i) => world[i]);
    return angle3(a, b, c);
  });
  return angles.reduce((x, y) => x + y, 0) / angles.length;
}

export class RepEngine {
  reps = 0;
  stage: Stage = "up";
  readonly log: Rep[] = [];
  private ema = 180;
  private hold = 0;
  private bottom = 180;
  private repStart = 0;
  private lastRep = 0;
  private lostSince = 0;
  private setStart = 0;
  private cue?: string;

  constructor(
    public exercise: Exercise,
    private onRep: (r: Rep, reps: number) => void = () => {},
  ) {}

  reset() {
    this.reps = 0;
    this.log.length = 0;
    this.setStart = 0;
    this.abandonRep();
  }

  private abandonRep() {
    this.stage = "up";
    this.hold = 0;
    this.bottom = 180;
    this.repStart = 0;
    this.cue = undefined;
  }

  lost(t = performance.now()): EngineState {
    this.hold = 0;
    if (!this.lostSince) this.lostSince = t;
    else if (t - this.lostSince > LOST_RESET_MS && this.stage === "down") this.abandonRep();
    return { reps: this.reps, stage: "lost", angle: Math.round(this.ema), visible: false, flagged: [] };
  }

  update(img: P2V[], world: P3[], t: number): EngineState {
    const cfg = CFG[this.exercise];
    const sides = usableSides(this.exercise, img, world);
    if (!sides.length) return this.lost(t); // never count on bad tracking
    if (this.lostSince && t - this.lostSince > LOST_RESET_MS && this.stage === "down") this.abandonRep();
    this.lostSince = 0;
    if (!this.setStart) this.setStart = t;

    if (cfg.horizontal && !torsoHorizontal(world)) {
      // standing arm bends must never count as push-ups
      this.hold = 0;
      return { reps: this.reps, stage: "break", angle: Math.round(this.ema), visible: true, flagged: [], cue: "Get into push-up position" };
    }

    this.ema = 0.5 * jointAngle(this.exercise, sides, world) + 0.5 * this.ema; // light smoothing
    if (this.stage === "up" && !this.repStart && this.ema < cfg.up - 10) this.repStart = t;
    if (this.stage === "down") {
      this.bottom = Math.min(this.bottom, this.ema);
      this.cue ??= formCue(this.exercise, img, world, sides[0]);
    }

    const crossing = this.stage === "up" ? this.ema <= cfg.down : this.ema >= cfg.up;
    this.hold = crossing ? this.hold + 1 : 0; // N consecutive frames = no single-frame reps
    if (this.hold >= HOLD) {
      this.hold = 0;
      if (this.stage === "up") this.stage = "down";
      else {
        this.stage = "up";
        if (t - this.lastRep > MIN_REP_MS) {
          this.reps++;
          this.lastRep = t;
          const rep: Rep = {
            depth: Math.round(this.bottom),
            tempo: +((t - (this.repStart || t)) / 1000).toFixed(1),
            at: Math.round(t - this.setStart),
            ...(this.cue ? { cue: this.cue } : {}),
          };
          this.log.push(rep);
          this.onRep(rep, this.reps); // send the "rep" message immediately
        }
        this.bottom = 180;
        this.repStart = 0;
        this.cue = undefined;
      }
    }
    const flagged = this.cue ? [cfg.joints[sides[0]][1]] : []; // highlight knee / elbow in red
    return { reps: this.reps, stage: this.stage, angle: Math.round(this.ema), visible: true, flagged };
  }
}

export function formCue(ex: Exercise, img: P2V[], world: P3[], side = 0): string | undefined {
  if (ex === "squat") {
    // front view: knees caving inward relative to ankles
    const knees = Math.abs(img[KNEE[0]].x - img[KNEE[1]].x);
    const ankles = Math.abs(img[ANK[0]].x - img[ANK[1]].x);
    return knees < ankles * 0.8 ? "Push your knees out over your toes" : undefined;
  }
  // side view: shoulder-hip-ankle on the tracked side
  const hipLine = angle3(world[SH[side]], world[HIP[side]], world[ANK[side]]);
  return hipLine < 155 ? "Keep your hips in line" : undefined;
}

/** Plank: hold time accumulates only while the body line is straight and the torso is horizontal. */
export class PlankEngine {
  readonly exercise = "plank" as const;
  reps = 0;
  holdMs = 0;
  private last = 0;
  private ema = 180;
  readonly log: Rep[] = [];

  reset() {
    this.holdMs = 0;
    this.last = 0;
  }

  lost(): EngineState {
    this.last = 0;
    return { reps: 0, stage: "lost", angle: Math.round(this.ema), visible: false, flagged: [], holdMs: Math.round(this.holdMs), good: false };
  }

  update(img: P2V[], world: P3[], t: number): EngineState {
    const sides = usableSides("plank", img, world);
    if (!sides.length) return this.lost();
    const dt = this.last ? Math.min(250, t - this.last) : 0; // cap gaps so a stall never adds a lump of time
    this.last = t;
    const side = sides[0];
    const [s, h, a] = CFG.plank.joints[side];
    this.ema = 0.5 * angle3(world[s], world[h], world[a]) + 0.5 * this.ema;
    const horizontal = torsoHorizontal(world);
    const good = horizontal && this.ema >= PLANK_GOOD;
    if (good) this.holdMs += dt;
    let cue: string | undefined;
    if (!horizontal) cue = "Get into plank position";
    else if (!good) cue = plankCue(img, s, h, a);
    return {
      reps: 0,
      stage: good ? "hold" : "break",
      angle: Math.round(this.ema),
      visible: true,
      flagged: good ? [] : [h],
      holdMs: Math.round(this.holdMs),
      good,
      cue,
    };
  }
}

/** Sag vs pike from the image: is the hip below or above the shoulder-ankle line? (image y grows downward) */
export function plankCue(img: P2V[], s: number, h: number, a: number) {
  const A = img[s], B = img[a], H = img[h];
  const k = Math.abs(B.x - A.x) < 1e-6 ? 0.5 : (H.x - A.x) / (B.x - A.x);
  const lineY = A.y + k * (B.y - A.y);
  return H.y > lineY ? "Lift your hips a little" : "Lower your hips into a straight line";
}
