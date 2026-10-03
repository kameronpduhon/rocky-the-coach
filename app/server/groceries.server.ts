import { and, between, eq } from "drizzle-orm";
import { foods, meals } from "~/content";
import type { Db } from "~/db/client";
import { groceryChecks, plannedMeals } from "~/db/schema";
import { addDays, weekStart } from "~/domain/dates";
import { buildGroceryList, SECTION_LABEL, type Section } from "~/domain/groceries";
import { previewWeek, type MealSwap } from "~/domain/next-week";
import type { ISODate } from "~/domain/types";
import { mealRepeats, rotationMeals } from "./checkin.server";
import { ensureWeekPlan, lastEaten, restedSlugs } from "./meal-plan.server";

export interface GroceryGroup {
  section: Section;
  label: string;
  items: { foodId: string; name: string; grams: number; each: string | null }[];
}

export interface GroceryList {
  monday: ISODate;
  /** False while next week is still a check-in preview and not yet written to the plan. */
  planned: boolean;
  groups: GroceryGroup[];
  count: number;
  checked: string[];
}

/**
 * The week's planned meals as a shopping list. A future week that has no plan yet is shown as the check-in
 * would generate it: with the given rests and swaps, or by default resting what was eaten 3+ times.
 */
export async function groceryList(db: Db, monday: ISODate, today: ISODate, preview: { rest: string[] | null; swaps: MealSwap[] }): Promise<GroceryList> {
  const sunday = addDays(monday, 6);
  let rows = await db.select().from(plannedMeals).where(between(plannedMeals.date, monday, sunday)).all();
  let slugs: string[];
  let planned = true;
  if (rows.length === 0 && monday > weekStart(today)) {
    planned = false;
    const rest = preview.rest ?? (await mealRepeats(db, addDays(monday, -7))).mealCounts.map((m) => m.slug);
    const week = previewWeek({
      weekStart: monday,
      meals: rotationMeals(),
      lastEaten: await lastEaten(db, monday),
      rested: [...(await restedSlugs(db, monday)), ...rest],
      swaps: preview.swaps,
    });
    slugs = week.map((p) => p.slug);
  } else {
    if (rows.length === 0) {
      await ensureWeekPlan(db, monday);
      rows = await db.select().from(plannedMeals).where(between(plannedMeals.date, monday, sunday)).all();
    }
    slugs = rows.map((r) => r.mealSlug);
  }

  const ingredients = new Map([...meals.values()].map((m) => [m.slug, m.ingredients.map((i) => ({ foodId: i.food, grams: i.grams }))]));
  const groups = buildGroceryList(slugs, ingredients, new Map([...foods].map(([id, f]) => [id, { name: f.name, section: f.section }]))).map((g) => ({
    section: g.section,
    label: SECTION_LABEL[g.section],
    items: g.items.map((i) => {
      const f = foods.get(i.foodId)!;
      const n = f.eachG ? Math.round(i.grams / f.eachG) : 0;
      return { ...i, each: n > 0 && f.eachLabel ? `about ${n} ${f.eachLabel}${n === 1 ? "" : "s"}` : null };
    }),
  }));
  const checked = (await db.select().from(groceryChecks).where(eq(groceryChecks.weekStart, monday)).all()).map((c) => c.foodId);
  return { monday, planned, groups, count: groups.reduce((n, g) => n + g.items.length, 0), checked };
}

export async function setGroceryCheck(db: Db, monday: ISODate, foodId: string, checked: boolean): Promise<void> {
  if (checked) await db.insert(groceryChecks).values({ weekStart: monday, foodId }).onConflictDoNothing();
  else await db.delete(groceryChecks).where(and(eq(groceryChecks.weekStart, monday), eq(groceryChecks.foodId, foodId)));
}
