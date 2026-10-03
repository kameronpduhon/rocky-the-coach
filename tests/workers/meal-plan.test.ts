import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { mealState, plannedMeals } from "~/db/schema";
import { ensureWeekPlan, plannedForDate, restMeal, swapPlanned } from "~/server/meal-plan.server";
import { db } from "./helpers";

describe("meal plan", () => {
  it("generates the week once with 35 slots", async () => {
    await ensureWeekPlan(db(), "2026-10-12");
    await ensureWeekPlan(db(), "2026-10-12");
    const rows = await db().select().from(plannedMeals).all();
    expect(rows.filter((r) => r.date >= "2026-10-12" && r.date <= "2026-10-18")).toHaveLength(35);
  });

  it("returns a day's slots in order, generating the week on demand", async () => {
    const slots = await plannedForDate(db(), "2026-10-21");
    expect(slots.map((s) => s.slot)).toEqual(["breakfast", "lunch", "snack", "dinner", "dessert"]);
    expect(slots.every((s) => s.meal.name.length > 0)).toBe(true);
  });

  it("swaps one slot for today only", async () => {
    await swapPlanned(db(), "2026-10-21", "dessert", "baked-cinnamon-apple", false, "2026-10-21");
    const slots = await plannedForDate(db(), "2026-10-21");
    const dessert = slots.find((s) => s.slot === "dessert")!;
    expect(dessert.meal.slug).toBe("baked-cinnamon-apple");
    expect(dessert.swapped).toBe(true);
  });

  it("rests the original for 4 weeks on an always swap", async () => {
    const before = (await plannedForDate(db(), "2026-10-22")).find((s) => s.slot === "breakfast")!;
    const replacement = before.meal.slug === "steak-and-eggs" ? "greek-yogurt-power-bowl" : "steak-and-eggs";
    await swapPlanned(db(), "2026-10-22", "breakfast", replacement, true, "2026-10-22");
    const state = await db().select().from(mealState).where(eq(mealState.slug, before.meal.slug)).get();
    expect(state?.restedUntil).toBe("2026-11-19");
  });

  it("never plans a rested meal in a new week", async () => {
    await restMeal(db(), "chicken-and-rice-bowl", "2026-11-30");
    await ensureWeekPlan(db(), "2026-11-02");
    const rows = await db().select().from(plannedMeals).all();
    const week = rows.filter((r) => r.date >= "2026-11-02" && r.date <= "2026-11-08");
    expect(week.map((r) => r.mealSlug)).not.toContain("chicken-and-rice-bowl");
  });

  it("repicks a slot whose meal file no longer exists", async () => {
    await ensureWeekPlan(db(), "2026-11-09");
    await db().update(plannedMeals).set({ mealSlug: "deleted-meal" }).where(eq(plannedMeals.date, "2026-11-10"));
    const slots = await plannedForDate(db(), "2026-11-10");
    expect(slots.every((s) => s.meal.slug !== "deleted-meal")).toBe(true);
  });
});
