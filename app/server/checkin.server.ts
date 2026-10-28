import { and, between, eq, sql } from "drizzle-orm";
import { meals } from "~/content";
import type { Db } from "~/db/client";
import { checkIns, mealLogs } from "~/db/schema";
import { addDays } from "~/domain/dates";
import type { RotationMeal } from "~/domain/rotation";
import type { ISODate } from "~/domain/types";

// The check-in runs on the phone (app/checkin/*) and saves through finishCheckIn. What stays here serves the
// reminders and Today's server reads (checkInDone, checkInWindow), and v1 groceries until P4c (mealRepeats, rotationMeals).
export { checkInWindow } from "~/domain/checkin";

export async function checkInDone(db: Db, monday: ISODate): Promise<boolean> {
  return (await db.select().from(checkIns).where(eq(checkIns.weekStart, monday)).get()) !== undefined;
}

export function rotationMeals(): RotationMeal[] {
  return [...meals.values()].map((m) => ({ slug: m.slug, pool: m.pool, mode: m.mode, tags: m.tags }));
}

/** Planned meals eaten this week, and the ones eaten 3 or more times, for v1 groceries' default rests. */
export async function mealRepeats(db: Db, monday: ISODate) {
  const counts = await db
    .select({ slug: mealLogs.mealSlug, n: sql<number>`count(*)` })
    .from(mealLogs)
    .where(and(between(mealLogs.date, monday, addDays(monday, 6)), eq(mealLogs.category, "planned")))
    .groupBy(mealLogs.mealSlug)
    .all();
  const mealCounts = counts
    .filter((c) => c.slug && meals.has(c.slug) && c.n >= 3)
    .map((c) => ({ slug: c.slug!, name: meals.get(c.slug!)!.name, count: c.n, defaultRest: true }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { counts, mealCounts };
}
