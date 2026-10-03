import { and, between, eq, sql } from "drizzle-orm";
import { meals, plan } from "~/content";
import type { Db } from "~/db/client";
import { checkIns, mealLogs, plannedMeals } from "~/db/schema";
import { weekAdherence, weekIsOnPlan } from "~/domain/adherence";
import { decideAdjustment, type Adjustment } from "~/domain/adjustments";
import { isTrainingDay, weekNumber } from "~/domain/calendar";
import { addDays, localDate, localMinutes, weekStart, weekday } from "~/domain/dates";
import { previewWeek, swapFits, type MealSwap } from "~/domain/next-week";
import type { RotationMeal } from "~/domain/rotation";
import { rampStepGoal } from "~/domain/steps";
import type { ISODate } from "~/domain/types";
import { sevenDayAverage, weeklyChange } from "~/domain/weight";
import { logWaist, waistLogsAll, weighInsBetween } from "./body.server";
import { datesWithSets, dayResults } from "./history.server";
import { ensureWeekPlan, lastEaten, restMeal, restedSlugs } from "./meal-plan.server";
import { baseTargetsFor, setTargetsFrom } from "./targets.server";

/** The Monday of the week under review while the check-in is open (Sunday 5pm to Monday noon), else null. */
export function checkInWindow(now: Date): ISODate | null {
  const today = localDate(now);
  const minutes = localMinutes(now);
  const wd = weekday(today);
  if (wd === 0 && minutes >= 17 * 60) return weekStart(today);
  if (wd === 1 && minutes < 12 * 60) return addDays(weekStart(today), -7);
  return null;
}

export async function checkInDone(db: Db, monday: ISODate): Promise<boolean> {
  return (await db.select().from(checkIns).where(eq(checkIns.weekStart, monday)).get()) !== undefined;
}

export function rotationMeals(): RotationMeal[] {
  return [...meals.values()].map((m) => ({ slug: m.slug, pool: m.pool, mode: m.mode, tags: m.tags }));
}

export interface CheckInData {
  weekStart: ISODate;
  weekEnd: ISODate;
  weekNumber: number;
  avgWeight: number | null;
  change: number | null;
  adherence: number;
  onPlan: boolean;
  relaxedMeals: number;
  workoutsDone: number;
  workoutsPlanned: number;
  optionalDone: number;
  avgSteps: number;
  stepGoal: number;
  rampedStepGoal: number;
  kcal: number;
  proteinG: number;
  waist: number | null;
  outcome: Adjustment;
  mealCounts: { slug: string; name: string; count: number; defaultRest: boolean }[];
  /** Meals in next week's default plan that were not eaten this week. */
  preview: string[];
  /** What the browser needs to redraw next week's plan as Rest toggles and swaps change. */
  nextWeek: { weekStart: ISODate; lastEaten: Record<string, ISODate>; restedBefore: string[]; eatenThisWeek: string[] };
  done: boolean;
}

export async function checkInData(db: Db, monday: ISODate): Promise<CheckInData> {
  const sunday = addDays(monday, 6);
  const prevMonday = addDays(monday, -7);
  const weighIns = (await weighInsBetween(db, addDays(sunday, -20), sunday)).map((w) => ({ date: w.date, weight: w.weightLb }));
  const avgNow = sevenDayAverage(weighIns, sunday);
  const avgPrev = sevenDayAverage(weighIns, addDays(sunday, -7));
  const avgPrev2 = sevenDayAverage(weighIns, addDays(sunday, -14));

  const thisWeek = await dayResults(db, monday, sunday);
  const lastWeek = await dayResults(db, prevMonday, addDays(prevMonday, 6));
  const adherence = weekAdherence(thisWeek.map((d) => d.onPlan));
  const base = await baseTargetsFor(db, sunday);
  const outcome = decideAdjustment(
    [
      { change: weeklyChange(avgPrev, avgPrev2), onPlan: weekIsOnPlan(weekAdherence(lastWeek.map((d) => d.onPlan))) },
      { change: weeklyChange(avgNow, avgPrev), onPlan: weekIsOnPlan(adherence) },
    ],
    { kcal: base.kcal, stepGoal: base.stepGoal },
  );

  const setDates = await datesWithSets(db, monday, sunday);
  let workoutsDone = 0;
  let workoutsPlanned = 0;
  let optionalDone = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    if (isTrainingDay(plan, d)) {
      workoutsPlanned++;
      if (setDates.has(d)) workoutsDone++;
    } else if (setDates.has(d)) optionalDone++;
  }
  const avgSteps = Math.round(thisWeek.reduce((s, d) => s + d.steps, 0) / 7);

  const counts = await db
    .select({ slug: mealLogs.mealSlug, n: sql<number>`count(*)` })
    .from(mealLogs)
    .where(and(between(mealLogs.date, monday, sunday), eq(mealLogs.category, "planned")))
    .groupBy(mealLogs.mealSlug)
    .all();
  const mealCounts = counts
    .filter((c) => c.slug && meals.has(c.slug) && c.n >= 2)
    .map((c) => ({ slug: c.slug!, name: meals.get(c.slug!)!.name, count: c.n, defaultRest: c.n >= 3 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const relaxed = await db
    .select({ n: sql<number>`count(*)` })
    .from(mealLogs)
    .where(and(between(mealLogs.date, monday, sunday), eq(mealLogs.relaxed, true)))
    .get();

  const nextMonday = addDays(monday, 7);
  const restedBefore = await restedSlugs(db, nextMonday);
  const eatenThisWeek = counts.map((c) => c.slug).filter((s): s is string => s !== null);
  const nextLastEaten = await lastEaten(db, nextMonday);
  const previewPlan = previewWeek({
    weekStart: nextMonday,
    meals: rotationMeals(),
    lastEaten: nextLastEaten,
    rested: [...restedBefore, ...mealCounts.filter((m) => m.defaultRest).map((m) => m.slug)],
    swaps: [],
  });
  const preview = newThisWeek(previewPlan.map((p) => p.slug), eatenThisWeek);

  const waists = await waistLogsAll(db);
  return {
    weekStart: monday,
    weekEnd: sunday,
    weekNumber: weekNumber(plan, monday),
    avgWeight: avgNow,
    change: weeklyChange(avgNow, avgPrev),
    adherence,
    onPlan: weekIsOnPlan(adherence),
    relaxedMeals: relaxed?.n ?? 0,
    workoutsDone,
    workoutsPlanned,
    optionalDone,
    avgSteps,
    stepGoal: base.stepGoal,
    rampedStepGoal: rampStepGoal(base.stepGoal, avgSteps),
    kcal: base.kcal,
    proteinG: base.proteinG,
    waist: waists.at(-1)?.inches ?? null,
    outcome,
    mealCounts,
    preview,
    nextWeek: { weekStart: nextMonday, lastEaten: nextLastEaten, restedBefore, eatenThisWeek },
    done: await checkInDone(db, monday),
  };
}

/** Names of planned meals that were not eaten this week, mains first, in plan order. */
export function newThisWeek(plannedSlugs: string[], eatenThisWeek: string[]): string[] {
  const order = { main: 0, breakfast: 1, snack: 2, dessert: 3 } as const;
  const fresh = [...new Set(plannedSlugs)].filter((s) => !eatenThisWeek.includes(s) && meals.has(s));
  return fresh
    .map((s, i) => ({ meal: meals.get(s)!, i }))
    .sort((a, b) => order[a.meal.pool] - order[b.meal.pool] || a.i - b.i)
    .slice(0, 3)
    .map((x) => x.meal.name);
}

export interface CheckInInput {
  waist: number | null;
  choice: "calories" | "steps";
  rest: string[];
  swaps?: MealSwap[];
}

export async function completeCheckIn(db: Db, monday: ISODate, input: CheckInInput, now: Date): Promise<void> {
  const data = await checkInData(db, monday);
  const nextMonday = addDays(monday, 7);
  const base = await baseTargetsFor(db, data.weekEnd);

  let kcal = base.kcal;
  let stepGoal = data.rampedStepGoal;
  if (data.outcome.kind === "slow") {
    if (input.choice === "steps" && data.outcome.newStepGoal !== null) stepGoal = data.outcome.newStepGoal;
    else kcal = data.outcome.newKcal;
  } else if (data.outcome.kind === "fast") {
    kcal = data.outcome.newKcal;
  }
  await setTargetsFrom(db, nextMonday, { kcal, proteinG: base.proteinG, stepGoal });

  if (input.waist !== null) await logWaist(db, data.weekEnd, input.waist);
  for (const slug of input.rest) if (meals.has(slug)) await restMeal(db, slug, addDays(nextMonday, 13));

  await db.delete(plannedMeals).where(between(plannedMeals.date, nextMonday, addDays(nextMonday, 6)));
  await ensureWeekPlan(db, nextMonday);
  const rested = await restedSlugs(db, nextMonday);
  for (const swap of input.swaps ?? []) {
    if (swap.date < nextMonday || swap.date > addDays(nextMonday, 6) || !swapFits(swap, rotationMeals(), rested)) continue;
    await db
      .insert(plannedMeals)
      .values({ date: swap.date, slot: swap.slot, mealSlug: swap.slug, swapped: true })
      .onConflictDoUpdate({ target: [plannedMeals.date, plannedMeals.slot], set: { mealSlug: swap.slug, swapped: true } });
  }

  await db
    .insert(checkIns)
    .values({
      weekStart: monday,
      avgWeight: data.avgWeight,
      change: data.change,
      adherence: data.adherence,
      outcome: JSON.stringify({ ...data.outcome, choice: input.choice, kcal, stepGoal }),
      completedAt: now.toISOString(),
    })
    .onConflictDoNothing();
}
