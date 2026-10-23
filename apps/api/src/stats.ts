// Lifetime stats per profile (DynamoDB item sk STATS): totals and day streaks.
// Streaks use the TV's local calendar date (WorkoutInput.localDate) so a late-night session counts for that day.
import type { LifetimeStats } from "@firefit/shared";

const DAY = 86_400_000;
const dayNum = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / DAY);

export const EMPTY_STATS: LifetimeStats = { workouts: 0, totalSec: 0, totalKcal: 0, currentStreak: 0, bestStreak: 0, lastDate: null };

/** Fold one finished session into the running stats. */
export function nextStats(prev: LifetimeStats, w: { durationSec: number; caloriesEst: number; date: string }): LifetimeStats {
  let current = prev.currentStreak;
  let last = prev.lastDate;
  if (!last) {
    current = 1;
    last = w.date;
  } else {
    const gap = dayNum(w.date) - dayNum(last);
    if (gap === 1) current += 1;
    else if (gap > 1) current = 1;
    if (gap > 0) last = w.date; // same day: no change; an older date never rewinds the streak
  }
  return {
    workouts: prev.workouts + 1,
    totalSec: Math.round(prev.totalSec + w.durationSec),
    totalKcal: Math.round(prev.totalKcal + w.caloriesEst),
    currentStreak: current,
    bestStreak: Math.max(prev.bestStreak, current),
    lastDate: last,
  };
}

/** Rebuild stats from history (used when a profile predates the STATS item). */
export function deriveStats(sessions: { durationSec: number; caloriesEst: number; date: string }[]): LifetimeStats {
  return [...sessions].sort((a, b) => a.date.localeCompare(b.date)).reduce(nextStats, EMPTY_STATS);
}
