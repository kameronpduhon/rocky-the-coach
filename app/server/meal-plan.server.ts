import { and, between, eq, gte, isNotNull, lt, max } from "drizzle-orm";
import { meals, type MealWithMacros } from "~/content";
import type { Db } from "~/db/client";
import { mealLogs, mealState, plannedMeals } from "~/db/schema";
import { dayMode } from "~/domain/calendar";
import { addDays, weekStart } from "~/domain/dates";
import { generateWeek, type RotationMeal } from "~/domain/rotation";
import { SLOTS, slotPool, type ISODate, type Slot } from "~/domain/types";

export interface PlannedSlot {
  date: ISODate;
  slot: Slot;
  meal: MealWithMacros;
  swapped: boolean;
}

function rotationMeals(): RotationMeal[] {
  return [...meals.values()].map((m) => ({ slug: m.slug, pool: m.pool, mode: m.mode, tags: m.tags }));
}

export async function restedSlugs(db: Db, date: ISODate): Promise<string[]> {
  const rows = await db.select({ slug: mealState.slug }).from(mealState).where(gte(mealState.restedUntil, date)).all();
  return rows.map((r) => r.slug);
}

export async function lastEaten(db: Db, before: ISODate): Promise<Record<string, ISODate>> {
  const rows = await db
    .select({ slug: mealLogs.mealSlug, last: max(mealLogs.date) })
    .from(mealLogs)
    .where(and(isNotNull(mealLogs.mealSlug), lt(mealLogs.date, before)))
    .groupBy(mealLogs.mealSlug)
    .all();
  return Object.fromEntries(rows.filter((r) => r.slug && r.last).map((r) => [r.slug!, r.last!]));
}

export async function ensureWeekPlan(db: Db, start: ISODate): Promise<void> {
  const existing = await db
    .select({ date: plannedMeals.date })
    .from(plannedMeals)
    .where(between(plannedMeals.date, start, addDays(start, 6)))
    .limit(1)
    .all();
  if (existing.length > 0) return;

  const week = generateWeek({
    weekStart: start,
    meals: rotationMeals(),
    lastEaten: await lastEaten(db, start),
    rested: await restedSlugs(db, start),
  });
  // D1 caps bound parameters per statement, so insert one day (5 rows) at a time.
  for (let d = 0; d < 7; d++) {
    const day = week.slice(d * 5, d * 5 + 5).map((p) => ({ date: p.date, slot: p.slot, mealSlug: p.slug, swapped: false }));
    await db.insert(plannedMeals).values(day).onConflictDoNothing();
  }
}

function fallbackMeal(slot: Slot, date: ISODate, rested: string[]): MealWithMacros {
  const mode = dayMode(date);
  const pick = [...meals.values()].find(
    (m) => m.pool === slotPool(slot) && (m.mode === "any" || mode === "weekend") && !rested.includes(m.slug),
  );
  if (!pick) throw new Error(`No meal for ${slot}`);
  return pick;
}

export async function plannedForDate(db: Db, date: ISODate): Promise<PlannedSlot[]> {
  await ensureWeekPlan(db, weekStart(date));
  const rows = await db.select().from(plannedMeals).where(eq(plannedMeals.date, date)).all();
  const bySlot = new Map(rows.map((r) => [r.slot as Slot, r]));
  const out: PlannedSlot[] = [];
  for (const slot of SLOTS) {
    const row = bySlot.get(slot);
    let meal = row ? meals.get(row.mealSlug) : undefined;
    if (!meal) {
      meal = fallbackMeal(slot, date, await restedSlugs(db, date));
      await db
        .insert(plannedMeals)
        .values({ date, slot, mealSlug: meal.slug, swapped: false })
        .onConflictDoUpdate({ target: [plannedMeals.date, plannedMeals.slot], set: { mealSlug: meal.slug } });
    }
    out.push({ date, slot, meal, swapped: row?.swapped ?? false });
  }
  return out;
}

export async function restMeal(db: Db, slug: string, until: ISODate): Promise<void> {
  await db.insert(mealState).values({ slug, restedUntil: until }).onConflictDoUpdate({ target: mealState.slug, set: { restedUntil: until } });
}

export async function swapPlanned(db: Db, date: ISODate, slot: Slot, slug: string, always: boolean, today: ISODate): Promise<void> {
  const current = await db.select().from(plannedMeals).where(and(eq(plannedMeals.date, date), eq(plannedMeals.slot, slot))).get();
  await db
    .insert(plannedMeals)
    .values({ date, slot, mealSlug: slug, swapped: true })
    .onConflictDoUpdate({ target: [plannedMeals.date, plannedMeals.slot], set: { mealSlug: slug, swapped: true } });
  if (always && current && current.mealSlug !== slug) await restMeal(db, current.mealSlug, addDays(today, 28));
}
