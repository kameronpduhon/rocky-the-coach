import { weekType } from "~/domain/calendar";
import { weekStart } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import { plan } from "./index";

export interface Targets {
  kcal: number;
  proteinG: number;
  stepGoal: number;
}

export interface TargetEntry extends Targets {
  effectiveFrom: ISODate;
}

/** A finished check-in's burn estimate, kcal a day. */
export interface BurnEntry {
  /** The Monday of the week the check-in reviewed. */
  weekStart: ISODate;
  burn: number;
}

/** Burns from raw `check_ins` rows: the phone's copy, or a mutator's scan. v1 rows have none. */
export function burnEntries(rows: Record<string, unknown>[]): BurnEntry[] {
  return rows.filter((r) => typeof r.burn === "number").map((r) => ({ weekStart: r.week_start as ISODate, burn: r.burn as number }));
}

/** What a maintenance week eats: the burn from the latest check-in before that week, or the plan's estimate before any. */
export function maintenanceKcal(burns: BurnEntry[], date: ISODate): number {
  const monday = weekStart(date);
  let latest: BurnEntry | null = null;
  for (const b of burns) if (b.weekStart < monday && (latest === null || b.weekStart > latest.weekStart)) latest = b;
  return latest?.burn ?? plan.maintenanceKcal;
}

/** rows must be sorted by effectiveFrom ascending. */
export function resolveBaseTargets(rows: TargetEntry[], date: ISODate): Targets {
  let base: Targets = { ...plan.startingTargets };
  for (const r of rows) {
    if (r.effectiveFrom > date) break;
    base = { kcal: r.kcal, proteinG: r.proteinG, stepGoal: r.stepGoal };
  }
  return base;
}

export function resolveTargets(rows: TargetEntry[], date: ISODate, burns: BurnEntry[]): Targets {
  const base = resolveBaseTargets(rows, date);
  return weekType(plan, date) === "maintenance" ? { ...base, kcal: maintenanceKcal(burns, date) } : base;
}
