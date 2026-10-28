// Next week's meals as the check-in sees them (spec section 1, "Meal repeats and rests"). Pure: the page previews with
// it, finishCheckIn writes with the same rotation inputs, and P4c's grocery preview reuses previewNextWeek.
import { foods, meals } from "~/content";
import { addDays } from "~/domain/dates";
import { buildGroceryList } from "~/domain/groceries";
import { generateWeek, type PlannedMeal, type RotationMeal } from "~/domain/rotation";
import type { ISODate } from "~/domain/types";
import { restedOn, type Rows } from "~/today/slots";

/** Eaten this many times in a week, a meal is listed with a rest switch. */
export const REPEAT_AT = 3;
/** From this many, the switch starts on. */
export const REST_DEFAULT_AT = 4;

export interface MealRepeat {
  slug: string;
  name: string;
  count: number;
}

export function rotationMeals(): RotationMeal[] {
  return [...meals.values()].map((m) => ({ slug: m.slug, pool: m.pool, mode: m.mode, tags: m.tags }));
}

/** Planned meals eaten 3 or more times in the week, most first, then by name. A skip has no slug, so it never counts. */
export function mealRepeats(rows: Rows, monday: ISODate): MealRepeat[] {
  const sunday = addDays(monday, 6);
  const counts = new Map<string, number>();
  for (const l of rows("meal_logs")) {
    const d = l.date as ISODate;
    if (l.category !== "planned" || typeof l.meal_slug !== "string" || d < monday || d > sunday) continue;
    counts.set(l.meal_slug, (counts.get(l.meal_slug) ?? 0) + 1);
  }
  return [...counts]
    .filter(([slug, count]) => count >= REPEAT_AT && meals.has(slug))
    .map(([slug, count]) => ({ slug, name: meals.get(slug)!.name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The switches as the page opens: on for 4 or more, off for 3. */
export function defaultRests(repeats: MealRepeat[]): string[] {
  return repeats.filter((r) => r.count >= REST_DEFAULT_AT).map((r) => r.slug);
}

/** A rest chosen at this check-in runs two full weeks: next Monday plus 13 days, as v1 did. */
export function restUntil(monday: ISODate): ISODate {
  return addDays(monday, 20);
}

/** Meals resting at some point this week that are back in rotation by next Monday, by name. */
export function backFromRest(rows: Rows, monday: ISODate): string[] {
  const next = addDays(monday, 7);
  return rows("meal_state")
    .filter((r) => typeof r.rested_until === "string" && r.rested_until >= monday && r.rested_until < next && meals.has(r.slug as string))
    .map((r) => meals.get(r.slug as string)!.name)
    .sort((a, b) => a.localeCompare(b));
}

/** The latest day each meal was eaten before a date, as the rotation reads it. */
export function lastEatenBefore(rows: Rows, before: ISODate): Record<string, ISODate> {
  const out: Record<string, ISODate> = {};
  for (const l of rows("meal_logs")) {
    const slug = l.meal_slug;
    const d = l.date as ISODate;
    if (typeof slug !== "string" || d >= before) continue;
    if (!out[slug] || d > out[slug]) out[slug] = d;
  }
  return out;
}

/** The rests an earlier finish of this week saved, from its check-in row. */
function finishedRests(rows: Rows, monday: ISODate): string[] {
  const row = rows("check_ins").find((r) => r.week_start === monday);
  try {
    const o = JSON.parse(String(row?.outcome ?? "{}")) as { rest?: unknown };
    return Array.isArray(o.rest) ? o.rest.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Next week's 35 slots as Finish would write them: the rotation, with what already rests next Monday and the switches
 * that are on. On a redo, a rest this week's finish set and whose switch is now off is left out, as Finish undoes it.
 */
export function previewNextWeek(rows: Rows, monday: ISODate, rest: string[]): PlannedMeal[] {
  const next = addDays(monday, 7);
  const until = restUntil(monday);
  const undone = new Set(finishedRests(rows, monday).filter((slug) => !rest.includes(slug)));
  const kept = [...restedOn(rows, next)].filter((slug) => !(undone.has(slug) && rows("meal_state").some((r) => r.slug === slug && r.rested_until === until)));
  return generateWeek({ weekStart: next, meals: rotationMeals(), lastEaten: lastEatenBefore(rows, next), rested: [...new Set([...kept, ...rest])] });
}

/** How many foods a week of meals needs, as the grocery list counts them. The grams don't change the count. */
export function groceryCount(slugs: string[]): number {
  const ingredients = new Map([...meals.values()].map((m) => [m.slug, m.ingredients.map((i) => ({ foodId: i.food, grams: i.grams }))]));
  const info = new Map([...foods].map(([id, f]) => [id, { name: f.name, section: f.section }]));
  return buildGroceryList(slugs, ingredients, info).reduce((n, g) => n + g.items.length, 0);
}
