import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { addDays, localDate } from "~/domain/dates";
import { datesWithWorkouts } from "~/server/history.server";
import { progressData } from "~/server/progress.server";
import { processPush } from "~/sync/push.server";
import { db } from "./helpers";

// v1 screens (Progress, the check-in counts) keep reading workouts the new screens write.
const now = new Date();
const at = now.toISOString();
const day = (n: number) => addDays(localDate(now), -n);
const push = (clientId: string, mutations: { name: string; args: unknown }[]) => processPush(env.DB, { clientId, mutations: mutations.map((m, i) => ({ id: i + 1, ...m })) }, now);

describe("v1 readers see workouts made on the new screens", () => {
  it("shows Your own, checked off without numbers, in Progress and counts its day", async () => {
    const date = day(1);
    const res = await push("phone-1", [
      { name: "planWorkout", args: { clientId: "own-1", date, templateId: "custom", at } },
      { name: "setLifts", args: { workout: "own-1", lifts: [{ position: 100, exercise: "pull-up", repMin: 8, repMax: 12, from: "added" }] } },
      { name: "checkLift", args: { workout: "own-1", exercise: "pull-up", done: true } },
      { name: "finishWorkout", args: { workout: "own-1", at } },
    ]);
    expect(res.rejected).toEqual([]);
    const { recentWorkouts } = await progressData(db(), localDate(now));
    expect(recentWorkouts).toContainEqual(expect.objectContaining({ date, name: "Custom workout", sets: 0, checks: 1 }));
    expect(await datesWithWorkouts(db(), date, date)).toEqual(new Set([date]));
  });

  it("leaves a workout planned but never started out of Progress and the counts", async () => {
    const date = day(2);
    await push("phone-2", [{ name: "planWorkout", args: { clientId: "plan-only", date, templateId: "wed-legs-shoulders", at } }]);
    const { recentWorkouts } = await progressData(db(), localDate(now));
    expect(recentWorkouts.some((w) => w.date === date)).toBe(false);
    expect(await datesWithWorkouts(db(), date, date)).toEqual(new Set());
  });
});
