// Zod-free so the TV bundle can import it without pulling in the validation library.
import type { Exercise, NextWorkout } from "./index";

// Default programs shown on the library before the coach has an opinion.
export const PROGRAMS: Record<Exercise, NextWorkout & { title: string; blurb: string }> = {
  squat: { title: "Squat Fundamentals", blurb: "Build depth and control", exercise: "squat", sets: 2, targetReps: 5, restSec: 45 },
  pushup: { title: "Push-Up Builder", blurb: "Upper-body strength", exercise: "pushup", sets: 2, targetReps: 5, restSec: 45 },
};
