import { and, between, eq, sql } from "drizzle-orm";
import { plan } from "~/content";
import type { Db } from "~/db/client";
import { mealLogs, setLogs, workoutSessions } from "~/db/schema";
import { isOnPlan } from "~/domain/adherence";
import { isRelaxedDay } from "~/domain/calendar";
import { addDays, daysBetween } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import { stepsBetween } from "./body.server";
import { allTargets, resolveTargets, type Targets } from "./targets.server";

export interface DayResult {
  date: ISODate;
  kcal: number;
  proteinG: number;
  steps: number;
  offPlanDessert: boolean;
  relaxed: boolean;
  targets: Targets;
  onPlan: boolean;
}

export async function dayResults(db: Db, from: ISODate, to: ISODate): Promise<DayResult[]> {
  const food = await db
    .select({
      date: mealLogs.date,
      kcal: sql<number>`coalesce(sum(${mealLogs.kcal}), 0)`,
      protein: sql<number>`coalesce(sum(${mealLogs.proteinG}), 0)`,
      dessert: sql<number>`max(case when ${mealLogs.category} = 'dessert' and ${mealLogs.relaxed} = 0 then 1 else 0 end)`,
    })
    .from(mealLogs)
    .where(between(mealLogs.date, from, to))
    .groupBy(mealLogs.date)
    .all();
  const foodByDate = new Map(food.map((f) => [f.date, f]));
  const stepsByDate = new Map((await stepsBetween(db, from, to)).map((s) => [s.date, s.steps]));
  const targetRows = await allTargets(db);

  const out: DayResult[] = [];
  for (let i = 0; i <= daysBetween(from, to); i++) {
    const date = addDays(from, i);
    const f = foodByDate.get(date);
    const t = resolveTargets(targetRows, date);
    const facts = {
      proteinG: f?.protein ?? 0,
      steps: stepsByDate.get(date) ?? 0,
      offPlanDessert: (f?.dessert ?? 0) === 1,
      relaxedDay: isRelaxedDay(plan, date),
      proteinTarget: t.proteinG,
      stepGoal: t.stepGoal,
    };
    out.push({
      date,
      kcal: f?.kcal ?? 0,
      proteinG: facts.proteinG,
      steps: facts.steps,
      offPlanDessert: facts.offPlanDessert,
      relaxed: facts.relaxedDay,
      targets: t,
      onPlan: isOnPlan(facts),
    });
  }
  return out;
}

/** Dates in [from, to] that have at least one logged set. */
export async function datesWithSets(db: Db, from: ISODate, to: ISODate): Promise<Set<ISODate>> {
  const rows = await db
    .selectDistinct({ date: workoutSessions.date })
    .from(workoutSessions)
    .innerJoin(setLogs, eq(setLogs.sessionId, workoutSessions.id))
    .where(and(between(workoutSessions.date, from, to)))
    .all();
  return new Set(rows.map((r) => r.date));
}
