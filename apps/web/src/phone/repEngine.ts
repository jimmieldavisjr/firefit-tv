// Deterministic, phone-authoritative rep counting. No ML model decides whether a rep happened:
// a rep is an up -> down -> up cycle where each crossing holds for HOLD consecutive frames.
// Angles come from MediaPipe world landmarks (metric, 3D), so phone orientation and aspect ratio don't skew them.
import type { Exercise, Rep, Stage } from "@firefit/shared";

/** Minimal landmark shapes (structurally compatible with @mediapipe/tasks-vision). */
export type P3 = { x: number; y: number; z: number };
export type P2V = { x: number; y: number; visibility?: number };

export const CFG = {
  // [hip, knee, ankle] left/right  |  [shoulder, elbow, wrist] left/right
  squat: { joints: [[23, 25, 27], [24, 26, 28]], down: 105, up: 160 },
  pushup: { joints: [[11, 13, 15], [12, 14, 16]], down: 90, up: 155 },
} as const;
export const HOLD = 3;
export const MIN_REP_MS = 600;
export const MIN_VIS = 0.6;
/** Tracking gaps longer than this abandon a half-finished rep instead of completing it later. */
export const LOST_RESET_MS = 1500;

export type EngineState = { reps: number; stage: Stage; angle: number; visible: boolean; flagged: number[] };

export function angle3(a: P3, b: P3, c: P3) {
  const u = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v = [c.x - b.x, c.y - b.y, c.z - b.z];
  const m = Math.hypot(...u) * Math.hypot(...v) || 1e-6;
  return (Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / m))) * 180) / Math.PI;
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
  private cue?: string;

  constructor(
    public exercise: Exercise,
    private onRep: (r: Rep, reps: number) => void = () => {},
  ) {}

  reset() {
    this.reps = 0;
    this.log.length = 0;
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
    const vis = cfg.joints.map((j) => Math.min(...j.map((i) => img[i]?.visibility ?? 0)));
    const side = vis[0] >= vis[1] ? 0 : 1;
    if (vis[side] < MIN_VIS || cfg.joints[side].some((i) => !world[i])) return this.lost(t); // never count on bad tracking
    if (this.lostSince && t - this.lostSince > LOST_RESET_MS && this.stage === "down") this.abandonRep();
    this.lostSince = 0;

    const [a, b, c] = cfg.joints[side].map((i) => world[i]);
    this.ema = 0.5 * angle3(a, b, c) + 0.5 * this.ema; // light smoothing
    if (this.stage === "up" && !this.repStart && this.ema < cfg.up - 10) this.repStart = t;
    if (this.stage === "down") {
      this.bottom = Math.min(this.bottom, this.ema);
      this.cue ??= formCue(this.exercise, img, world);
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
    const flagged = this.cue ? cfg.joints[side].slice(1, 2) : []; // highlight knee / elbow in red
    return { reps: this.reps, stage: this.stage, angle: Math.round(this.ema), visible: true, flagged: [...flagged] };
  }
}

export function formCue(ex: Exercise, img: P2V[], world: P3[]): string | undefined {
  if (ex === "squat") {
    // front view: knees caving inward relative to ankles
    const knees = Math.abs(img[25].x - img[26].x);
    const ankles = Math.abs(img[27].x - img[28].x);
    return knees < ankles * 0.8 ? "Push your knees out over your toes" : undefined;
  }
  const hipLine = angle3(world[11], world[23], world[27]); // side view: shoulder-hip-ankle
  return hipLine < 160 ? "Keep your hips in line" : undefined;
}
