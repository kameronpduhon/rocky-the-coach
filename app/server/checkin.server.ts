import { and, between, eq, sql } from "drizzle-orm";
import type { CallPick } from "~/checkin/call";
import { meals, plan } from "~/content";
import { HALF_PORTION_KCAL } from "~/content/scaled";
import type { Db } from "~/db/client";
import { checkIns, mealLogs, plannedMeals } from "~/db/schema";
import { weekAdherence, weekIsOnPlan } from "~/domain/adherence";
import { isTrainingDay, weekNumber, weekType } from "~/domain/calendar";
import { dayIntake, type LogFacts } from "~/domain/completeness";
import { addDays } from "~/domain/dates";
import { energyHistory, nextTarget, type Call, type EnergyWeek } from "~/domain/energy";
import { freshMeals, previewWeek, swapFits, type MealSwap } from "~/domain/next-week";
import type { RotationMeal } from "~/domain/rotation";
import { rampStepGoal } from "~/domain/steps";
import { roundLb, trendReading, trendSeries, weeklyTrendChange } from "~/domain/trend";
import type { ISODate } from "~/domain/types";
import { logWaist, waistLogsAll, weighInsThrough } from "./body.server";
import { datesWithWorkouts, dayResults } from "./history.server";
import { ensureWeekPlan, lastEaten, restMeal, restedSlugs } from "./meal-plan.server";
import { movesBetween } from "./schedule.server";
import { baseTargetsFor, setTargetsFrom, targetsFor } from "./targets.server";

export { checkInWindow } from "~/domain/checkin";

export async function checkInDone(db: Db, monday: ISODate): Promise<boolean> {
  return (await db.select().from(checkIns).where(eq(checkIns.weekStart, monday)).get()) !== undefined;
}

export function rotationMeals(): RotationMeal[] {
  return [...meals.values()].map((m) => ({ slug: m.slug, pool: m.pool, mode: m.mode, tags: m.tags }));
}

/**
 * Planned meals eaten this week, and the ones eaten 3 or more times. The spec lists only those with a Rest
 * toggle (on by default): the rotation already allows twice a week, so a 2 is normal and not burnout.
 */
export async function mealRepeats(db: Db, monday: ISODate) {
  const counts = await db
    .select({ slug: mealLogs.mealSlug, n: sql<number>`count(*)` })
    .from(mealLogs)
    .where(and(between(mealLogs.date, monday, addDays(monday, 6)), eq(mealLogs.category, "planned")))
    .groupBy(mealLogs.mealSlug)
    .all();
  const mealCounts = counts
    .filter((c) => c.slug && meals.has(c.slug) && c.n >= 3)
    .map((c) => ({ slug: c.slug!, name: meals.get(c.slug!)!.name, count: c.n, defaultRest: true }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { counts, mealCounts };
}

/** What a finished check-in stores in `outcome`: the call, and what was picked. */
export interface CallOutcome {
  kind: Call["kind"];
  newKcal: number;
  newStepGoal: number;
  pick: CallPick;
  guardrail: Call["guardrail"];
}

export interface CheckInData {
  weekStart: ISODate;
  weekEnd: ISODate;
  weekNumber: number;
  /** The trend on Sunday, to 0.1 lb. Null before 3 weigh-ins. */
  trendWeight: number | null;
  /** Sunday's trend minus last Sunday's, to 0.1 lb. */
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
  /** This week's burn entry. */
  energy: EnergyWeek;
  /** Last week's burn: the plan's 2,800 until a week has updated. */
  lastBurn: number;
  call: Call;
  /** This week's calorie target as eaten, a maintenance week included. "On your scale from Monday" starts from it. */
  thisWeekKcal: number;
  /** The pick a finished check-in saved, so "Update check-in" opens on it. */
  savedPick: CallPick | null;
  mealCounts: { slug: string; name: string; count: number; defaultRest: boolean }[];
  /** Meals in next week's default plan that were not eaten this week. */
  preview: string[];
  /** What the browser needs to redraw next week's plan as Rest toggles and swaps change. */
  nextWeek: { weekStart: ISODate; lastEaten: Record<string, ISODate>; restedBefore: string[]; eatenThisWeek: string[] };
  done: boolean;
}

/** A week before the phase began: nothing to read, so the burn holds at the plan's estimate. */
const beforePhase = (monday: ISODate): EnergyWeek => ({
  weekStart: monday,
  burn: plan.maintenanceKcal,
  state: "holding",
  updates: 0,
  observed: null,
  intakeAvg: null,
  trackedDays: 0,
  windowTrackedDays: 0,
  weighIns: 0,
  trendStart: null,
  trendEnd: null,
});

/** The burn week by week from the phase start, read from the weigh-ins and each day's meals. Nothing is stored between weeks. */
async function burnWeeks(db: Db, monday: ISODate, weighIns: { date: ISODate; weight: number }[]): Promise<EnergyWeek[]> {
  const sunday = addDays(monday, 6);
  const logs = await db
    .select({ date: mealLogs.date, slot: mealLogs.slot, category: mealLogs.category, kcal: mealLogs.kcal })
    .from(mealLogs)
    .where(between(mealLogs.date, plan.phaseStart, sunday))
    .all();
  const byDate = new Map<ISODate, (LogFacts & { kcal: number })[]>();
  for (const l of logs) byDate.set(l.date, [...(byDate.get(l.date) ?? []), l]);
  const series = trendSeries(weighIns, sunday);
  const weighed = new Set(weighIns.map((w) => w.date));
  return energyHistory({
    phaseStart: plan.phaseStart,
    through: monday,
    priorBurn: plan.maintenanceKcal,
    intake: (d) => {
      const day = byDate.get(d);
      return day ? dayIntake(day) : null;
    },
    trend: (d) => series.get(d) ?? null,
    weighedIn: (d) => weighed.has(d),
  });
}

function savedPickOf(outcome: string | undefined): CallPick | null {
  if (!outcome) return null;
  try {
    const pick = (JSON.parse(outcome) as { pick?: unknown }).pick;
    return pick === "calories" || pick === "steps" ? pick : null;
  } catch {
    return null;
  }
}

export async function checkInData(db: Db, monday: ISODate): Promise<CheckInData> {
  const sunday = addDays(monday, 6);
  const weighIns = (await weighInsThrough(db, sunday)).map((w) => ({ date: w.date, weight: w.weightLb }));
  const series = trendSeries(weighIns, sunday);
  const trendWeight = trendReading(weighIns, sunday)?.weight ?? null;
  const thisChange = weeklyTrendChange(series, sunday);

  const thisWeek = await dayResults(db, monday, sunday);
  const adherence = weekAdherence(thisWeek.map((d) => d.onPlan));
  const avgSteps = Math.round(thisWeek.reduce((s, d) => s + d.steps, 0) / 7);
  const [base, thisWeekTargets, weeks, saved] = await Promise.all([
    baseTargetsFor(db, sunday),
    targetsFor(db, sunday),
    burnWeeks(db, monday, weighIns),
    db.select().from(checkIns).where(eq(checkIns.weekStart, monday)).get(),
  ]);
  const rampedStepGoal = rampStepGoal(base.stepGoal, avgSteps);
  const energy = weeks.at(-1) ?? beforePhase(monday);
  const call = nextTarget({
    week: energy,
    trendWeight: series.get(sunday) ?? 0,
    currentKcal: base.kcal,
    stepGoal: rampedStepGoal,
    baseStepGoal: base.stepGoal,
    changes: [thisChange, weeklyTrendChange(series, addDays(sunday, -7))],
    maintenanceNext: weekType(plan, addDays(monday, 7)) === "maintenance",
    halfPortionKcal: HALF_PORTION_KCAL,
    // v1's page has no taps. P4b replaces this path.
    hungry: false,
  });

  const [setDates, moves] = await Promise.all([datesWithWorkouts(db, monday, sunday), movesBetween(db, monday, sunday)]);
  let workoutsDone = 0;
  let workoutsPlanned = 0;
  let optionalDone = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    if (isTrainingDay(plan, d, moves)) {
      workoutsPlanned++;
      if (setDates.has(d)) workoutsDone++;
    } else if (setDates.has(d)) optionalDone++;
  }

  const { counts, mealCounts } = await mealRepeats(db, monday);
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
  const preview = freshMeals(previewPlan.map((p) => p.slug), eatenThisWeek, (slug) => meals.get(slug)?.pool).map((slug) => meals.get(slug)!.name);

  const waists = await waistLogsAll(db);
  return {
    weekStart: monday,
    weekEnd: sunday,
    weekNumber: weekNumber(plan, monday),
    trendWeight,
    change: trendWeight !== null && thisChange !== null ? roundLb(thisChange) : null,
    adherence,
    onPlan: weekIsOnPlan(adherence),
    relaxedMeals: relaxed?.n ?? 0,
    workoutsDone,
    workoutsPlanned,
    optionalDone,
    avgSteps,
    stepGoal: base.stepGoal,
    rampedStepGoal,
    kcal: base.kcal,
    proteinG: base.proteinG,
    waist: waists.at(-1)?.inches ?? null,
    energy,
    lastBurn: weeks.at(-2)?.burn ?? plan.maintenanceKcal,
    call,
    thisWeekKcal: thisWeekTargets.kcal,
    savedPick: savedPickOf(saved?.outcome),
    mealCounts,
    preview,
    nextWeek: { weekStart: nextMonday, lastEaten: nextLastEaten, restedBefore, eatenThisWeek },
    done: saved !== undefined,
  };
}

export interface CheckInInput {
  waist: number | null;
  choice: CallPick;
  rest: string[];
  swaps?: MealSwap[];
}

export async function completeCheckIn(db: Db, monday: ISODate, input: CheckInInput, now: Date): Promise<void> {
  const data = await checkInData(db, monday);
  const nextMonday = addDays(monday, 7);
  const { call } = data;
  // Only a call with a walking option can take it. A maintenance week's calories pick keeps the base as it is.
  const pick: CallPick = input.choice === "steps" && call.steps ? "steps" : "calories";
  const chosen = pick === "steps" && call.steps ? call.steps : call.calories;
  await setTargetsFrom(db, nextMonday, { kcal: chosen.kcal, proteinG: data.proteinG, stepGoal: chosen.stepGoal });

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

  const outcome: CallOutcome = { kind: call.kind, newKcal: chosen.kcal, newStepGoal: chosen.stepGoal, pick, guardrail: call.guardrail };
  const fields = {
    avgWeight: data.trendWeight,
    change: data.change,
    adherence: data.adherence,
    outcome: JSON.stringify(outcome),
    burn: data.energy.burn,
    burnState: data.energy.state,
    intakeAvg: data.energy.intakeAvg,
    trackedDays: data.energy.trackedDays,
  };
  // "Update check-in" saves the new pick over the old one. completed_at keeps the first finish.
  await db
    .insert(checkIns)
    .values({ weekStart: monday, ...fields, completedAt: now.toISOString() })
    .onConflictDoUpdate({ target: checkIns.weekStart, set: fields });
}
