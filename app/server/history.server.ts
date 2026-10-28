import { and, between, eq, exists, isNotNull, or, sql } from "drizzle-orm";
import { plan } from "~/content";
import type { Db } from "~/db/client";
import { exerciseChecks, mealLogs, setLogs, workoutSessions } from "~/db/schema";
import { isOnPlan } from "~/domain/adherence";
import { isRelaxedDay } from "~/domain/calendar";
import { addDays, daysBetween, weekStart } from "~/domain/dates";
import { overAllowanceDates } from "~/domain/habits";
import type { ISODate } from "~/domain/types";
import { stepsBetween } from "./body.server";
import { allBurns, allTargets, resolveTargets, type Targets } from "./targets.server";

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
  const [food, steps, targetRows, desserts, burns] = await Promise.all([
    db
      .select({
        date: mealLogs.date,
        kcal: sql<number>`coalesce(sum(${mealLogs.kcal}), 0)`,
        protein: sql<number>`coalesce(sum(${mealLogs.proteinG}), 0)`,
      })
      .from(mealLogs)
      .where(between(mealLogs.date, from, to))
      .groupBy(mealLogs.date)
      .all(),
    stepsBetween(db, from, to),
    allTargets(db),
    db
      .select({ date: mealLogs.date, at: mealLogs.loggedAt })
      .from(mealLogs)
      .where(and(eq(mealLogs.category, "dessert"), eq(mealLogs.relaxed, false), between(mealLogs.date, weekStart(from), to)))
      .all(),
    allBurns(db),
  ]);
  // From the Monday of the first week, so the allowance counts desserts eaten before `from`.
  const overAllowance = overAllowanceDates(desserts);
  const foodByDate = new Map(food.map((f) => [f.date, f]));
  const stepsByDate = new Map(steps.map((s) => [s.date, s.steps]));

  const out: DayResult[] = [];
  for (let i = 0; i <= daysBetween(from, to); i++) {
    const date = addDays(from, i);
    const f = foodByDate.get(date);
    const t = resolveTargets(targetRows, date, burns);
    const facts = {
      proteinG: f?.protein ?? 0,
      steps: stepsByDate.get(date) ?? 0,
      offPlanDessert: overAllowance.has(date),
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

/** Dates in [from, to] with a workout done: a logged set, an exercise checked off, or the workout marked done. */
export async function datesWithWorkouts(db: Db, from: ISODate, to: ISODate): Promise<Set<ISODate>> {
  const rows = await db
    .selectDistinct({ date: workoutSessions.date })
    .from(workoutSessions)
    .where(
      and(
        between(workoutSessions.date, from, to),
        or(
          isNotNull(workoutSessions.endedAt),
          exists(db.select({ one: sql`1` }).from(setLogs).where(eq(setLogs.sessionId, workoutSessions.id))),
          exists(db.select({ one: sql`1` }).from(exerciseChecks).where(eq(exerciseChecks.sessionId, workoutSessions.id))),
        ),
      ),
    )
    .all();
  return new Set(rows.map((r) => r.date));
}
