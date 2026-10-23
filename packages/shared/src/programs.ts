// Zod-free so the TV bundle can import it without pulling in the validation library.
import type { BlockPlan, Exercise } from "./index";

/** The one FireFIT session: squats, push-ups, plank, kept short (3 reps, 3 reps, 5-second holds) so a full run fits a demo. */
export const DEFAULT_SESSION: { blocks: BlockPlan[] } = {
  blocks: [
    { exercise: "squat", sets: 3, target: 3, restSec: 45 },
    { exercise: "pushup", sets: 3, target: 3, restSec: 45 },
    { exercise: "plank", sets: 3, target: 5, restSec: 30 },
  ],
};

/** "5 minutes and 39 seconds", "2 minutes", "45 seconds": how people say a duration (the coach text is read aloud). */
export function durationWords(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (!m) return part(s, "second");
  return s ? `${part(m, "minute")} and ${part(s, "second")}` : part(m, "minute");
}

export const EXERCISE_INFO: Record<Exercise, { name: string; plural: string; unit: "reps" | "sec"; camera: string; met: number }> = {
  // MET values: Compendium of Physical Activities (calisthenics); used only for the labeled calorie estimate
  squat: { name: "Squat", plural: "Squats", unit: "reps", camera: "Face the phone, standing, whole body in frame", met: 5.0 },
  pushup: { name: "Push-Up", plural: "Push-ups", unit: "reps", camera: "Phone at floor level, side view, whole body in frame", met: 3.8 },
  plank: { name: "Plank", plural: "Plank", unit: "sec", camera: "Phone at floor level, side view, whole body in frame", met: 3.0 },
};

export const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;
export const GOALS = ["Strength", "Form", "Endurance", "Active"] as const;
