import { describe, expect, it } from "vitest";
import { meals } from "~/content";
import { latestWeighIn, logWaist, logWeighIn, stepsFor, upsertSteps, weighInFor } from "~/server/body.server";
import { createBatch, logPlannedMeal, logOffPlan, logsForDate, mainProtein, openBatch, unlog } from "~/server/meals.server";
import { db } from "./helpers";

describe("meal logs", () => {
  it("logs a planned meal with its macros and unlogs it", async () => {
    const meal = meals.get("chicken-and-rice-bowl")!;
    const id = await logPlannedMeal(db(), "2026-10-12", "lunch", meal, new Date());
    let logs = await logsForDate(db(), "2026-10-12");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ slot: "lunch", mealSlug: meal.slug, kcal: meal.kcal, proteinG: meal.protein, category: "planned" });
    await unlog(db(), id!);
    logs = await logsForDate(db(), "2026-10-12");
    expect(logs).toHaveLength(0);
  });

  it("logs off-plan food with a category and relaxed flag", async () => {
    await logOffPlan(db(), "2026-10-17", { name: "Restaurant dinner", category: "meal", kcal: 900, proteinG: 50, relaxed: true }, new Date());
    const [log] = await logsForDate(db(), "2026-10-17");
    expect(log).toMatchObject({ slot: null, mealSlug: null, relaxed: true, category: "meal" });
  });
});

describe("batches", () => {
  it("picks the ingredient carrying the most protein as the main protein", () => {
    expect(mainProtein(meals.get("chicken-and-rice-bowl")!).food).toBe("chicken-breast-raw");
    expect(mainProtein(meals.get("egg-and-potato-hash")!).food).toBe("egg-white");
  });

  it("splits a cooked batch and finds it for the next 3 days", async () => {
    const batch = await createBatch(db(), "chicken-and-rice-bowl", 3, 492, "2026-10-12");
    expect(batch.portionG).toBe(165);
    expect((await openBatch(db(), "chicken-and-rice-bowl", "2026-10-14"))?.id).toBe(batch.id);
    expect(await openBatch(db(), "chicken-and-rice-bowl", "2026-10-16")).toBeNull();
  });

  it("uses up a portion when the meal is eaten and closes the batch when empty", async () => {
    const batch = await createBatch(db(), "steak-and-baked-potato", 2, 400, "2026-10-12");
    const meal = meals.get("steak-and-baked-potato")!;
    await logPlannedMeal(db(), "2026-10-12", "dinner", meal, new Date());
    expect((await openBatch(db(), meal.slug, "2026-10-12"))?.portionsLeft).toBe(1);
    await logPlannedMeal(db(), "2026-10-13", "dinner", meal, new Date());
    expect(await openBatch(db(), meal.slug, "2026-10-13")).toBeNull();
    expect(batch.portions).toBe(2);
  });
});

describe("body logs", () => {
  it("upserts weigh-ins, waist, and steps by date", async () => {
    await logWeighIn(db(), "2026-10-12", 206.0, new Date());
    await logWeighIn(db(), "2026-10-12", 205.8, new Date());
    expect(await weighInFor(db(), "2026-10-12")).toBe(205.8);
    expect(await latestWeighIn(db())).toEqual({ date: "2026-10-12", weightLb: 205.8 });
    await logWaist(db(), "2026-10-18", 34.6);
    await upsertSteps(db(), "2026-10-12", 3120, new Date());
    await upsertSteps(db(), "2026-10-12", 5400, new Date());
    expect(await stepsFor(db(), "2026-10-12")).toBe(5400);
    expect(await stepsFor(db(), "2026-10-13")).toBe(0);
  });
});
