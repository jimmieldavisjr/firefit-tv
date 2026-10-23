// Zod-free so the TV bundle can import it without pulling in the validation library.
import type { BlockPlan, Exercise } from "./index";

/** The one FireFIT session: squats, push-ups, plank. About 10-12 minutes with rests. */
export const DEFAULT_SESSION: { blocks: BlockPlan[] } = {
  blocks: [
    { exercise: "squat", sets: 3, target: 10, restSec: 45 },
    { exercise: "pushup", sets: 3, target: 8, restSec: 45 },
    { exercise: "plank", sets: 3, target: 30, restSec: 30 },
  ],
};

export const EXERCISE_INFO: Record<Exercise, { name: string; plural: string; unit: "reps" | "sec"; camera: string; met: number }> = {
  // MET values: Compendium of Physical Activities (calisthenics); used only for the labeled calorie estimate
  squat: { name: "Squat", plural: "Squats", unit: "reps", camera: "Face the phone, standing, whole body in frame", met: 5.0 },
  pushup: { name: "Push-Up", plural: "Push-ups", unit: "reps", camera: "Phone at floor level, side view, whole body in frame", met: 3.8 },
  plank: { name: "Plank", plural: "Plank", unit: "sec", camera: "Phone at floor level, side view, whole body in frame", met: 3.0 },
};
