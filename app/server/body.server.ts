import { between, desc, eq } from "drizzle-orm";
import type { Db } from "~/db/client";
import { stepsDaily, waistLogs, weighIns } from "~/db/schema";
import type { ISODate } from "~/domain/types";

export async function logWeighIn(db: Db, date: ISODate, weightLb: number, now: Date): Promise<void> {
  await db
    .insert(weighIns)
    .values({ date, weightLb, loggedAt: now.toISOString() })
    .onConflictDoUpdate({ target: weighIns.date, set: { weightLb, loggedAt: now.toISOString() } });
}

/** Corrects a weigh-in, or adds a missed one. An existing entry keeps the time it was first logged. */
export async function setWeighIn(db: Db, date: ISODate, weightLb: number, now: Date): Promise<void> {
  await db.insert(weighIns).values({ date, weightLb, loggedAt: now.toISOString() }).onConflictDoUpdate({ target: weighIns.date, set: { weightLb } });
}

export async function deleteWeighIn(db: Db, date: ISODate): Promise<void> {
  await db.delete(weighIns).where(eq(weighIns.date, date));
}

export async function weighInFor(db: Db, date: ISODate): Promise<number | null> {
  return (await db.select().from(weighIns).where(eq(weighIns.date, date)).get())?.weightLb ?? null;
}

export async function weighInEntry(db: Db, date: ISODate): Promise<{ weightLb: number; loggedAt: string } | null> {
  const row = await db.select().from(weighIns).where(eq(weighIns.date, date)).get();
  return row ? { weightLb: row.weightLb, loggedAt: row.loggedAt } : null;
}

export async function latestWeighIn(db: Db): Promise<{ date: ISODate; weightLb: number } | null> {
  const row = await db.select().from(weighIns).orderBy(desc(weighIns.date)).get();
  return row ? { date: row.date, weightLb: row.weightLb } : null;
}

export function weighInsBetween(db: Db, from: ISODate, to: ISODate) {
  return db.select().from(weighIns).where(between(weighIns.date, from, to)).orderBy(weighIns.date).all();
}

export async function logWaist(db: Db, date: ISODate, inches: number): Promise<void> {
  await db.insert(waistLogs).values({ date, inches }).onConflictDoUpdate({ target: waistLogs.date, set: { inches } });
}

export function waistLogsAll(db: Db) {
  return db.select().from(waistLogs).orderBy(waistLogs.date).all();
}

export async function upsertSteps(db: Db, date: ISODate, steps: number, now: Date): Promise<void> {
  await db
    .insert(stepsDaily)
    .values({ date, steps, updatedAt: now.toISOString() })
    .onConflictDoUpdate({ target: stepsDaily.date, set: { steps, updatedAt: now.toISOString() } });
}

export async function stepsFor(db: Db, date: ISODate): Promise<number> {
  return (await db.select().from(stepsDaily).where(eq(stepsDaily.date, date)).get())?.steps ?? 0;
}

export function stepsBetween(db: Db, from: ISODate, to: ISODate) {
  return db.select().from(stepsDaily).where(between(stepsDaily.date, from, to)).all();
}
