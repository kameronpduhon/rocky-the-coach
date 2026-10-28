import { and, asc, desc, eq, gt, gte } from "drizzle-orm";
import { foods, meals, type MealWithMacros } from "~/content";
import { factorFor, scaledMeal } from "~/content/scaled";
import type { Db } from "~/db/client";
import { batches, mealLogs } from "~/db/schema";
import { addDays } from "~/domain/dates";
import { batchPortion } from "~/domain/macros";
import type { ISODate, Slot } from "~/domain/types";
import { targetsFor } from "./targets.server";

export type MealLog = typeof mealLogs.$inferSelect;
export type OffPlanCategory = "meal" | "snack" | "dessert" | "drink";

export function logsForDate(db: Db, date: ISODate): Promise<MealLog[]> {
  return db.select().from(mealLogs).where(eq(mealLogs.date, date)).orderBy(asc(mealLogs.loggedAt)).all();
}

export async function logPlannedMeal(db: Db, date: ISODate, slot: Slot, meal: MealWithMacros, now: Date, clientId?: string): Promise<number | null> {
  // Same snapshot as the logMeal change: the day's grams, or the grams its batch was cooked at.
  const batch = await openBatch(db, meal.slug, date);
  const factor = batch ? batch.factor : factorFor((await targetsFor(db, date)).kcal);
  const scaled = scaledMeal(meals.get(meal.slug) ?? meal, factor);
  const rows = await db
    .insert(mealLogs)
    .values({ date, slot, mealSlug: scaled.slug, name: scaled.name, category: "planned", kcal: scaled.kcal, proteinG: scaled.protein, loggedAt: now.toISOString(), clientId: clientId ?? null })
    .onConflictDoNothing()
    .returning({ id: mealLogs.id });
  if (rows.length === 0) return null;
  if (batch) await db.update(batches).set({ portionsLeft: batch.portionsLeft - 1 }).where(eq(batches.id, batch.id));
  return rows[0].id;
}

export async function logOffPlan(
  db: Db,
  date: ISODate,
  entry: { name: string; category: OffPlanCategory; kcal: number; proteinG: number; relaxed: boolean },
  now: Date,
): Promise<void> {
  await db.insert(mealLogs).values({ date, slot: null, mealSlug: null, ...entry, loggedAt: now.toISOString() });
}

export async function unlog(db: Db, id: number): Promise<void> {
  await db.delete(mealLogs).where(eq(mealLogs.id, id));
}

export function mainProtein(meal: MealWithMacros) {
  let best = meal.ingredients[0];
  let bestProtein = -1;
  for (const ing of meal.ingredients) {
    const p = (ing.grams / 100) * (foods.get(ing.food)?.proteinPer100 ?? 0);
    if (p > bestProtein) {
      best = ing;
      bestProtein = p;
    }
  }
  return best;
}

export type Batch = typeof batches.$inferSelect;

export async function createBatch(db: Db, mealSlug: string, portions: number, cookedWeightG: number, date: ISODate): Promise<Batch> {
  const [row] = await db
    .insert(batches)
    .values({
      mealSlug,
      portions,
      cookedWeightG,
      portionG: batchPortion(cookedWeightG, portions),
      createdOn: date,
      portionsLeft: portions,
      clientId: crypto.randomUUID(),
      factor: factorFor((await targetsFor(db, date)).kcal),
    })
    .returning();
  return row;
}

/** A batch stays usable for the day it was cooked plus 3 days. */
export async function openBatch(db: Db, mealSlug: string, date: ISODate): Promise<Batch | null> {
  const row = await db
    .select()
    .from(batches)
    .where(and(eq(batches.mealSlug, mealSlug), gt(batches.portionsLeft, 0), gte(batches.createdOn, addDays(date, -3))))
    .orderBy(desc(batches.id))
    .get();
  if (!row || row.createdOn > date) return null;
  return row;
}
