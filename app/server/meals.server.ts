import { and, asc, desc, eq, gt, gte } from "drizzle-orm";
import { foods, type MealWithMacros } from "~/content";
import type { Db } from "~/db/client";
import { batches, mealLogs } from "~/db/schema";
import { addDays } from "~/domain/dates";
import { batchPortion } from "~/domain/macros";
import type { ISODate, Slot } from "~/domain/types";

export type MealLog = typeof mealLogs.$inferSelect;
export type OffPlanCategory = "meal" | "snack" | "dessert" | "drink";

export function logsForDate(db: Db, date: ISODate): Promise<MealLog[]> {
  return db.select().from(mealLogs).where(eq(mealLogs.date, date)).orderBy(asc(mealLogs.loggedAt)).all();
}

export async function logPlannedMeal(db: Db, date: ISODate, slot: Slot, meal: MealWithMacros, now: Date, clientId?: string): Promise<number | null> {
  const rows = await db
    .insert(mealLogs)
    .values({ date, slot, mealSlug: meal.slug, name: meal.name, category: "planned", kcal: meal.kcal, proteinG: meal.protein, loggedAt: now.toISOString(), clientId: clientId ?? null })
    .onConflictDoNothing()
    .returning({ id: mealLogs.id });
  if (rows.length === 0) return null;
  const batch = await openBatch(db, meal.slug, date);
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
    .values({ mealSlug, portions, cookedWeightG, portionG: batchPortion(cookedWeightG, portions), createdOn: date, portionsLeft: portions })
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
