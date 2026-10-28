import { describe, expect, it } from "vitest";
import { addDays } from "~/domain/dates";
import { logWaist, logWeighIn } from "~/server/body.server";
import { nextPhotoDate, progressData } from "~/server/progress.server";
import { logSet } from "~/server/workouts.server";
import { db } from "./helpers";

describe("progress", () => {
  it("schedules progress photos every 4 weeks from the phase start", () => {
    expect(nextPhotoDate("2026-10-12")).toBe("2026-11-01");
    expect(nextPhotoDate("2026-11-01")).toBe("2026-11-01");
    expect(nextPhotoDate("2026-11-02")).toBe("2026-11-29");
  });

  it("builds the weight series, waist change, and strength gains", async () => {
    for (let i = 0; i < 14; i++) await logWeighIn(db(), addDays("2026-10-05", i), Math.round((207 - 0.13 * i) * 10) / 10, new Date());
    await logWaist(db(), "2026-10-04", 35.0);
    await logWaist(db(), "2026-10-18", 34.6);
    for (const [date, w] of [["2026-10-05", 50], ["2026-10-12", 55], ["2026-10-16", 60]] as const) {
      await logSet(db(), { date, templateId: "mon-chest-back-arms", position: 4, exerciseId: "preacher-curl", setNumber: 1, weightLb: w, reps: 10, clientId: crypto.randomUUID() }, new Date());
    }
    const p = await progressData(db(), "2026-10-18");
    expect(p.series).toHaveLength(14);
    // Weigh-ins 207, 206.9, 206.7, ... 205.3. The trend starts with the third: 207, 206.99, 206.961.
    expect(p.series[0]).toEqual({ date: "2026-10-05", weight: 207, trend: null });
    expect(p.series[1].trend).toBeNull();
    // The chart plots the trend unrounded; only the text rounds it.
    expect(p.series[2]).toMatchObject({ date: "2026-10-07", weight: 206.7 });
    expect(p.series[2].trend).toBeCloseTo(206.961, 6);
    // Oct 18's trend is 206.18, which is 0.82 below Oct 5's.
    expect(p.latestTrend).toBe(206.2);
    expect(p.series[13].trend).toBeCloseTo(206.18, 2);
    expect(p.series[13].trend).not.toBe(206.2);
    expect(p.changeSinceStart).toBe(-0.8);
    expect(p.waist).toEqual({ latest: 34.6, change: -0.4 });
    expect(p.strength[0]).toMatchObject({ name: "Preacher curl", from: 50, to: 60 });
    expect(p.nextPhoto).toBe("2026-11-01");
  });
});
