import { describe, expect, it } from "vitest";
import { deriveStats, EMPTY_STATS, nextStats } from "../src/stats";

const s = (date: string, durationSec = 600, caloriesEst = 40) => ({ date, durationSec, caloriesEst });

describe("lifetime stats", () => {
  it("sums workouts, time and calories", () => {
    const st = deriveStats([s("2026-10-20"), s("2026-10-21", 300, 20)]);
    expect(st).toMatchObject({ workouts: 2, totalSec: 900, totalKcal: 60 });
  });

  it("counts consecutive days as a streak; same-day sessions don't extend it", () => {
    const st = deriveStats([s("2026-10-20"), s("2026-10-21"), s("2026-10-21"), s("2026-10-22")]);
    expect([st.currentStreak, st.bestStreak, st.lastDate]).toEqual([3, 3, "2026-10-22"]);
  });

  it("restarts after a missed day but keeps the best streak", () => {
    const st = deriveStats([s("2026-10-01"), s("2026-10-02"), s("2026-10-03"), s("2026-10-05")]);
    expect([st.currentStreak, st.bestStreak]).toEqual([1, 3]);
  });

  it("an older date never rewinds the streak", () => {
    const st = nextStats(deriveStats([s("2026-10-21"), s("2026-10-22")]), s("2026-10-10"));
    expect([st.currentStreak, st.lastDate, st.workouts]).toEqual([2, "2026-10-22", 3]);
  });

  it("first session starts a 1-day streak across month boundaries", () => {
    expect(nextStats(EMPTY_STATS, s("2026-10-31")).currentStreak).toBe(1);
    expect(deriveStats([s("2026-10-31"), s("2026-11-01")]).currentStreak).toBe(2);
  });
});
