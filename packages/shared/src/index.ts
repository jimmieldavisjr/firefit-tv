// One contract for the phone, the TV and both Lambdas.
// Types are inferred from the Zod schemas so runtime validation and compile-time types never drift.
import { z } from "zod";

export const Exercise = z.enum(["squat", "pushup"]);
export type Exercise = z.infer<typeof Exercise>;

export type Stage = "up" | "down" | "lost";

export const Rep = z.object({
  depth: z.number().min(0).max(180),
  tempo: z.number().min(0).max(60),
  cue: z.string().max(80).optional(),
});
export type Rep = z.infer<typeof Rep>;

// phone -> TV over the DataChannel
export type PhoneMsg =
  | { t: "hello"; device: string; fps: number }
  | { t: "state"; seq: number; reps: number; stage: Stage; angle: number; visible: boolean; fps: number } // ~10 Hz
  | ({ t: "rep"; seq: number; reps: number } & Rep);

// TV -> phone (the remote drives the phone)
export type TvMsg =
  | { t: "config"; exercise: Exercise; targetReps: number }
  | { t: "start" }
  | { t: "pause" }
  | { t: "resetSet" }
  | { t: "end" };

// TV -> POST /workouts (structured metrics only, never media)
export const WorkoutInput = z.object({
  exercise: Exercise,
  sets: z.number().int().min(1).max(10),
  targetReps: z.number().int().min(1).max(50),
  reps: z.number().int().min(0).max(500),
  durationSec: z.number().min(0).max(7200),
  avgDepthDeg: z.number().min(0).max(180),
  avgTempoSec: z.number().min(0).max(60),
  perRep: z.array(Rep).max(500),
});
export type WorkoutInput = z.infer<typeof WorkoutInput>;

export const Decision = z.enum(["progress", "hold", "deload", "technique"]);
export type Decision = z.infer<typeof Decision>;

export const NextWorkout = z.object({
  exercise: Exercise,
  sets: z.number().int(),
  targetReps: z.number().int(),
  restSec: z.number().int(),
});
export type NextWorkout = z.infer<typeof NextWorkout>;

// What the agent (or the rules fallback) must produce before guardrails and persistence.
export const Plan = z.object({
  decision: Decision,
  recap: z.string().max(600).describe("2-3 sentences, at most 60 words, using only numbers returned by tools"),
  nextWorkout: NextWorkout,
  focusCue: z.string().max(120).describe("one short cue the TV shows during the next session"),
  reason: z.string().max(300).describe("one sentence naming the metric that drove the decision"),
});
export type Plan = z.infer<typeof Plan>;

// GET /workouts/{id}/coach
export type CoachPlan = Plan & {
  source: "agent" | "rules";
  model: string | null;
  toolCalls: string[];
  latencyMs: number;
  createdAt: string;
};

export type MetricSummary = { sessions: number; totalReps: number; bestReps: number; lastAt?: string };

// GET /profile -> library screen
export type ProfileView = {
  profile: { name: string; goal: string; level: string; nextWorkout?: NextWorkout; focusCue?: string; lastDecision?: Decision };
  metrics: Partial<Record<Exercise, MetricSummary>>;
  recent: (Omit<WorkoutInput, "perRep"> & { id: string; completedAt: string; decision?: Decision })[];
};

// POST /rooms
export type RoomCreated = { code: string; token: string; expiresAt: number };

export { PROGRAMS } from "./programs";
