import { asc } from "drizzle-orm";
import { resolveBaseTargets, resolveTargets, type Targets } from "~/content/targets";
import type { Db } from "~/db/client";
import { targets } from "~/db/schema";
import type { ISODate } from "~/domain/types";

export { resolveBaseTargets, resolveTargets, type Targets } from "~/content/targets";

export type TargetRow = typeof targets.$inferSelect;

export function allTargets(db: Db): Promise<TargetRow[]> {
  return db.select().from(targets).orderBy(asc(targets.effectiveFrom)).all();
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
