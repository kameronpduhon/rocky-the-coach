import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { plannedMeals } from "~/db/schema";
import { ensureWeekPlan, plannedForDate, restMeal } from "~/server/meal-plan.server";
import { db } from "./helpers";

describe("meal plan", () => {
  it("generates the week once with 35 slots", async () => {
    await ensureWeekPlan(db(), "2026-10-12");
    await ensureWeekPlan(db(), "2026-10-12");
    const rows = await db().select().from(plannedMeals).all();
    expect(rows.filter((r) => r.date >= "2026-10-12" && r.date <= "2026-10-18")).toHaveLength(35);
  });

  it("writes the week whole or not at all, so a write cut off mid-week can't leave days missing", async () => {
    await env.DB.exec(
      "CREATE TRIGGER cut_off BEFORE INSERT ON planned_meals WHEN NEW.date = '2026-10-29' BEGIN SELECT RAISE(ABORT, 'cut off'); END",
    );
    await expect(ensureWeekPlan(db(), "2026-10-26")).rejects.toThrow();
    await env.DB.exec("DROP TRIGGER cut_off");
    await ensureWeekPlan(db(), "2026-10-26");
    const rows = await db().select().from(plannedMeals).all();
    expect(rows.filter((r) => r.date >= "2026-10-26" && r.date <= "2026-11-01")).toHaveLength(35);
  });

  it("returns a day's slots in order, generating the week on demand", async () => {
    const slots = await plannedForDate(db(), "2026-10-21");
    expect(slots.map((s) => s.slot)).toEqual(["breakfast", "lunch", "snack", "dinner", "dessert"]);
    expect(slots.every((s) => s.meal.name.length > 0)).toBe(true);
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
