import { weekType } from "~/domain/calendar";
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

/** rows must be sorted by effectiveFrom ascending. */
export function resolveBaseTargets(rows: TargetEntry[], date: ISODate): Targets {
  let base: Targets = { ...plan.startingTargets };
  for (const r of rows) {
    if (r.effectiveFrom > date) break;
    base = { kcal: r.kcal, proteinG: r.proteinG, stepGoal: r.stepGoal };
  }
  return base;
}

export function resolveTargets(rows: TargetEntry[], date: ISODate): Targets {
  const base = resolveBaseTargets(rows, date);
  return weekType(plan, date) === "maintenance" ? { ...base, kcal: plan.maintenanceKcal } : base;
}
