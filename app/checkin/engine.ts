// The week's call over the phone's copy (spec section 1, "The call over the phone's copy"). The check-in page runs it
// in the browser, and finishCheckIn runs it over a scan of the same tables. N3's checkInData did the same through
// Drizzle; the inputs and outputs are the same. Pure.
import { plan } from "~/content";
import { HALF_PORTION_KCAL } from "~/content/scaled";
import { resolveBaseTargets, resolveTargets } from "~/content/targets";
import { weekNumber, weekType } from "~/domain/calendar";
import { dayIntake, type LogFacts } from "~/domain/completeness";
import { addDays } from "~/domain/dates";
import { energyHistory, nextTarget, type EnergyWeek } from "~/domain/energy";
import { rampStepGoal } from "~/domain/steps";
import { roundLb, trendReading, trendSeries, weeklyTrendChange } from "~/domain/trend";
import type { ISODate } from "~/domain/types";
import { checkInBurns, targetEntries, type Rows } from "~/today/slots";
import type { CallFacts } from "./call";

export interface WeekCall extends CallFacts {
  monday: ISODate;
  sunday: ISODate;
  /** The trend on Sunday, to 0.1 lb. Null before 3 weigh-ins. */
  trendWeight: number | null;
  /** Sunday's trend minus last Sunday's, to 0.1 lb. */
  change: number | null;
  /** The week's steps over 7, as v1 averaged them. */
  avgSteps: number;
  /** Next week's step goal after the ramp. */
  rampedStepGoal: number;
  /** This week's calorie target as eaten, a maintenance week included. "On your scale from Monday" starts from it. */
  thisWeekKcal: number;
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

/** Every weigh-in up to a date, oldest first. The trend starts at the first one ever. */
export function weighIns(rows: Rows, through: ISODate): { date: ISODate; weight: number }[] {
  return rows("weigh_ins")
    .map((r) => ({ date: r.date as ISODate, weight: Number(r.weight_lb) }))
    .filter((w) => w.date <= through)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** This check-in's hunger tap is High, and so is last week's saved one. A skipped check-in last week breaks the run. */
export function hungryTwice(rows: Rows, monday: ISODate, hunger: string | null): boolean {
  if (hunger !== "high") return false;
  const lastWeek = addDays(monday, -7);
  return rows("check_ins").some((r) => r.week_start === lastWeek && r.hunger === "high");
}

export function weekCall(rows: Rows, monday: ISODate, { hungry }: { hungry: boolean }): WeekCall {
  const sunday = addDays(monday, 6);
  const weights = weighIns(rows, sunday);
  const series = trendSeries(weights, sunday);
  const trendWeight = trendReading(weights, sunday)?.weight ?? null;
  const thisChange = weeklyTrendChange(series, sunday);

  const entries = targetEntries(rows);
  const base = resolveBaseTargets(entries, sunday);
  const thisWeekKcal = resolveTargets(entries, sunday, checkInBurns(rows)).kcal;
  const steps = new Map(rows("steps_daily").map((r) => [r.date as ISODate, Number(r.steps)]));
  let stepSum = 0;
  for (let i = 0; i < 7; i++) stepSum += steps.get(addDays(monday, i)) ?? 0;
  const avgSteps = Math.round(stepSum / 7);
  const rampedStepGoal = rampStepGoal(base.stepGoal, avgSteps);

  const byDate = new Map<ISODate, (LogFacts & { kcal: number })[]>();
  for (const l of rows("meal_logs")) {
    const d = l.date as ISODate;
    if (d < plan.phaseStart || d > sunday) continue;
    const day = byDate.get(d) ?? [];
    day.push({ slot: (l.slot as string | null) ?? null, category: l.category as string, kcal: Number(l.kcal) });
    byDate.set(d, day);
  }
  const weighed = new Set(weights.map((w) => w.date));
  const weeks = energyHistory({
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
    hungry,
  });
  return {
    monday,
    sunday,
    trendWeight,
    change: trendWeight !== null && thisChange !== null ? roundLb(thisChange) : null,
    avgSteps,
    rampedStepGoal,
    thisWeekKcal,
    call,
    energy,
    lastBurn: weeks.at(-2)?.burn ?? plan.maintenanceKcal,
    kcal: base.kcal,
    stepGoal: base.stepGoal,
    proteinG: base.proteinG,
    weekNumber: weekNumber(plan, monday),
  };
}
