import { asc } from "drizzle-orm";
import { plan } from "~/content";
import type { Db } from "~/db/client";
import { targets } from "~/db/schema";
import { weekType } from "~/domain/calendar";
import type { ISODate } from "~/domain/types";

export interface Targets {
  kcal: number;
  proteinG: number;
  stepGoal: number;
}

export type TargetRow = typeof targets.$inferSelect;

export function allTargets(db: Db): Promise<TargetRow[]> {
  return db.select().from(targets).orderBy(asc(targets.effectiveFrom)).all();
}

/** rows must be sorted by effectiveFrom ascending. */
export function resolveBaseTargets(rows: TargetRow[], date: ISODate): Targets {
  let base: Targets = { ...plan.startingTargets };
  for (const r of rows) {
    if (r.effectiveFrom > date) break;
    base = { kcal: r.kcal, proteinG: r.proteinG, stepGoal: r.stepGoal };
  }
  return base;
}

export function resolveTargets(rows: TargetRow[], date: ISODate): Targets {
  const base = resolveBaseTargets(rows, date);
  return weekType(plan, date) === "maintenance" ? { ...base, kcal: plan.maintenanceKcal } : base;
}

export async function targetsFor(db: Db, date: ISODate): Promise<Targets> {
  return resolveTargets(await allTargets(db), date);
}

export async function baseTargetsFor(db: Db, date: ISODate): Promise<Targets> {
  return resolveBaseTargets(await allTargets(db), date);
}

export async function setTargetsFrom(db: Db, effectiveFrom: ISODate, t: Targets): Promise<void> {
  await db
    .insert(targets)
    .values({ effectiveFrom, kcal: t.kcal, proteinG: t.proteinG, stepGoal: t.stepGoal })
    .onConflictDoUpdate({ target: targets.effectiveFrom, set: { kcal: t.kcal, proteinG: t.proteinG, stepGoal: t.stepGoal } });
}
