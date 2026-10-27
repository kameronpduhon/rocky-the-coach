import { between, inArray } from "drizzle-orm";
import { plan } from "~/content";
import type { Db } from "~/db/client";
import { scheduleMoves } from "~/db/schema";
import { swapWorkouts, templateFor, type Moves } from "~/domain/calendar";
import { weekStart } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import { datesWithWorkouts } from "./history.server";

export { weekSchedule, type ScheduleDay } from "~/content/schedule";

export async function movesBetween(db: Db, from: ISODate, to: ISODate): Promise<Moves> {
  const rows = await db.select().from(scheduleMoves).where(between(scheduleMoves.date, from, to)).all();
  return Object.fromEntries(rows.map((r) => [r.date, r.templateId]));
}

/** Makes two days of the same week trade workouts. Returns an error message, or null once it is done. */
export async function moveWorkout(db: Db, a: ISODate, b: ISODate): Promise<string | null> {
  if (a === b || weekStart(a) !== weekStart(b)) return "Pick another day this week.";
  const [first, last] = a < b ? [a, b] : [b, a];
  const [moves, setDates] = await Promise.all([movesBetween(db, first, last), datesWithWorkouts(db, first, last)]);
  if (templateFor(plan, a, moves) === null && templateFor(plan, b, moves) === null) return "Neither day has a workout.";
  if (setDates.has(a) || setDates.has(b)) return "That workout is already logged.";
  const moved = swapWorkouts(plan, moves, a, b).filter((d) => !d.usual);
  await db.batch([
    db.delete(scheduleMoves).where(inArray(scheduleMoves.date, [a, b])),
    ...moved.map((d) => db.insert(scheduleMoves).values({ date: d.date, templateId: d.templateId })),
  ]);
  return null;
}
