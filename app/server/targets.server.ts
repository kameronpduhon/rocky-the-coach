import { asc, isNotNull } from "drizzle-orm";
import { resolveBaseTargets, resolveTargets, type BurnEntry, type Targets } from "~/content/targets";
import type { Db } from "~/db/client";
import { checkIns, targets } from "~/db/schema";
import type { ISODate } from "~/domain/types";

export { resolveBaseTargets, resolveTargets, type BurnEntry, type Targets } from "~/content/targets";

export type TargetRow = typeof targets.$inferSelect;

export function allTargets(db: Db): Promise<TargetRow[]> {
  return db.select().from(targets).orderBy(asc(targets.effectiveFrom)).all();
}

export async function allBurns(db: Db): Promise<BurnEntry[]> {
  const rows = await db.select({ weekStart: checkIns.weekStart, burn: checkIns.burn }).from(checkIns).where(isNotNull(checkIns.burn)).orderBy(asc(checkIns.weekStart)).all();
  return rows.map((r) => ({ weekStart: r.weekStart, burn: r.burn! }));
}

export async function targetsFor(db: Db, date: ISODate): Promise<Targets> {
  const [rows, burns] = await Promise.all([allTargets(db), allBurns(db)]);
  return resolveTargets(rows, date, burns);
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
