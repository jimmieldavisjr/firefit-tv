// One contract for the phone, the TV and both Lambdas.
// Types are inferred from the Zod schemas so runtime validation and compile-time types never drift.
import { z } from "zod";

export const Exercise = z.enum(["squat", "pushup", "plank"]);
export type Exercise = z.infer<typeof Exercise>;
/** Squats and push-ups are counted in reps; the plank is a timed hold in seconds. */
export const UNIT: Record<Exercise, "reps" | "sec"> = { squat: "reps", pushup: "reps", plank: "sec" };

export type Stage = "up" | "down" | "lost" | "hold" | "break";

export const Rep = z.object({
  depth: z.number().min(0).max(180),
  tempo: z.number().min(0).max(60),
  cue: z.string().max(80).optional(),
  /** ms since the start of the set: gives the time between reps */
  at: z.number().min(0).max(3_600_000).optional(),
});
export type Rep = z.infer<typeof Rep>;

// phone -> TV over the DataChannel
export type PhoneMsg =
  | { t: "hello"; device: string; fps: number }
  | {
      t: "state"; // ~10 Hz
      seq: number;
      reps: number;
      stage: Stage;
      angle: number;
      visible: boolean;
      fps: number;
      /** plank only: accumulated good-form hold time in this set, and whether the current frame is good */
      holdMs?: number;
      good?: boolean;
      cue?: string;
    }
  | ({ t: "rep"; seq: number; reps: number } & Rep);

// TV -> phone (the remote drives the phone)
export type TvMsg =
  | { t: "config"; exercise: Exercise; target: number }
  | { t: "start" }
  | { t: "pause" }
  | { t: "resetSet" }
  | { t: "end" };

/** One exercise in a session: sets x target (reps, or seconds for the plank) with rest between sets. */
export const BlockPlan = z.object({
  exercise: Exercise,
  sets: z.number().int().min(1).max(5),
  target: z.number().int().min(1).max(180),
  restSec: z.number().int().min(0).max(180),
});
export type BlockPlan = z.infer<typeof BlockPlan>;

export const SessionPlan = z.object({ blocks: z.array(BlockPlan).min(1).max(3) });
export type SessionPlan = z.infer<typeof SessionPlan>;

// TV -> POST /workouts (structured metrics only, never media)
export const BlockResult = z.object({
  exercise: Exercise,
  sets: z.number().int().min(1).max(5), // planned
  target: z.number().int().min(1).max(180),
  setsDone: z.number().int().min(0).max(5),
  /** reps per set (squat/push-up) or held seconds per set (plank) */
  perSet: z.array(z.number().min(0).max(600)).max(5),
  /** set durations in seconds (start to end of each set) */
  setSec: z.array(z.number().min(0).max(900)).max(5),
  perRep: z.array(Rep).max(300),
  cues: z.array(z.string().max(80)).max(50).default([]),
});
export type BlockResult = z.infer<typeof BlockResult>;

export const WorkoutInput = z.object({
  plan: z.literal("full-body"),
  blocks: z.array(BlockResult).min(1).max(3),
  durationSec: z.number().min(0).max(7200),
  activeSec: z.number().min(0).max(7200),
  caloriesEst: z.number().min(0).max(2000),
  bodyWeightKg: z.number().min(30).max(250),
});
export type WorkoutInput = z.infer<typeof WorkoutInput>;

export const Decision = z.enum(["progress", "hold", "deload", "technique"]);
export type Decision = z.infer<typeof Decision>;

// What the agent (or the rules fallback) must produce before guardrails and persistence.
export const Plan = z.object({
  decision: Decision,
  recap: z.string().max(600).describe("2-3 sentences, at most 60 words, using only numbers returned by tools"),
  insights: z
    .array(z.string().max(200))
    .max(5)
    .describe("2-4 short, specific improvements, each naming an exercise and a measured number"),
  next: SessionPlan.describe("the next session: same three exercises in the same order, adjusted targets"),
  focusCue: z.string().max(120).describe("one short cue the TV shows during the next session"),
  reason: z.string().max(300).describe("one sentence naming the metric that drove the decision"),
});
export type Plan = z.infer<typeof Plan>;

export type TranscriptLine = { kind: "status" | "tool" | "text"; text: string; at: number };

// GET /workouts/{id}/coach: written incrementally while the agent runs, then finalized
export type CoachRun = {
  status: "running" | "done";
  transcript: TranscriptLine[];
  createdAt: string;
} & Partial<
  Plan & {
    source: "agent" | "rules";
    model: string | null;
    toolCalls: string[];
    latencyMs: number;
  }
>;
export type CoachPlan = CoachRun & Plan & { source: "agent" | "rules"; toolCalls: string[]; latencyMs: number };

export type MetricSummary = { sessions: number; totalReps: number; bestReps: number; lastAt?: string };

// GET /profile -> library screen
export type ProfileView = {
  profile: { name: string; goal: string; level: string; weightKg?: number; next?: SessionPlan; focusCue?: string; lastDecision?: Decision };
  metrics: Partial<Record<Exercise, MetricSummary>>;
  recent: { id: string; completedAt: string; durationSec: number; caloriesEst: number; blocks: Omit<BlockResult, "perRep">[]; decision?: Decision }[];
};

// POST /rooms
export type RoomCreated = { code: string; token: string; expiresAt: number };

export { DEFAULT_SESSION, EXERCISE_INFO } from "./programs";
