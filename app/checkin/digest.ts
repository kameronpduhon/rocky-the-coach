// Every number the check-in's week page shows, in one object (spec section 1, "The digest"). ruleTake reads it now;
// project 5 sends it to the AI and checks the AI's numbers against digestNumbers. Pure.
import { plan } from "~/content";
import { isRelaxedDay, weekNumber } from "~/domain/calendar";
import { dayIntake } from "~/domain/completeness";
import { addDays } from "~/domain/dates";
import {
  FAST_LOSS_LB,
  KCAL_FLOOR,
  MIN_TRACKED_IN_WEEK,
  MIN_TRACKED_IN_WINDOW,
  MIN_WEIGH_INS,
  SETTLING_UPDATES,
  WINDOW_DAYS,
  type BurnState,
  type Call,
  type EnergyWeek,
} from "~/domain/energy";
import { countedDay, DESSERT_ALLOWANCE, fullDay, overAllowanceDates } from "~/domain/habits";
import type { LoggedSet } from "~/domain/progression";
import { trendReading } from "~/domain/trend";
import type { ISODate } from "~/domain/types";
import { targetsOn, type Rows } from "~/today/slots";
import { loggedDates } from "~/workout/sessions";
import { hungryTwice, weekCall, weighIns } from "./engine";
import { liftWeek } from "./lifts";
import { backFromRest, defaultRests, mealRepeats } from "./meals";

export type Level = "low" | "fine" | "high";
export type SleepLevel = "poor" | "fine" | "great";
/** Why a holding burn holds, in the order N3's why-lines check it. */
export type HoldReason = "first-weeks" | "week-days" | "window-days" | "weigh-ins";

/** What the person has chosen on the page so far. */
export interface CheckInChoices {
  hunger: Level | null;
  energy: Level | null;
  sleep: SleepLevel | null;
  /** Slugs to rest. Null keeps the defaults: 4 or more times. */
  rest: string[] | null;
}

export interface CheckInDigest {
  week: { monday: ISODate; sunday: ISODate; number: number; weeksToCheckpoint: number };
  weight: { trend: number | null; change: number | null; sinceStart: number | null; firstDate: ISODate | null; firstWeight: number | null };
  /** `total` is the 7 days the counts are out of. */
  days: { counted: number; full: number; tracked: number; total: number };
  protein: { avg: number | null; target: number; lowDay: { date: ISODate; grams: number } | null };
  steps: { avg: number; goal: number; lowDay: { date: ISODate; steps: number } | null };
  intake: { avg: number | null };
  lifts: {
    planned: number;
    plannedDone: number;
    extras: ISODate[];
    missed: ISODate[];
    movedUp: { exercise: string; name: string; from: number; to: number }[];
    stuck: { exercise: string; name: string; top: number; lastSets: LoggedSet[]; chase: number[]; drop: number }[];
    nextWeekDeload: boolean;
  };
  /** `change` is now minus was, in inches. */
  waist: { now: number | null; was: number | null; wasDate: ISODate | null; change: number | null };
  desserts: { offPlan: number; allowance: number };
  feel: { hunger: Level | null; energy: Level | null; sleep: SleepLevel | null; hungryTwice: boolean };
  call: Call & {
    state: BurnState;
    burn: number;
    /** The week the burn stops settling, while it settles. */
    steadyBy: number | null;
    trackedDays: number;
    windowTrackedDays: number;
    weighIns: number;
    /** The 21-day window's average, as `check_ins.intake_avg` stores it. */
    intakeAvg: number | null;
    holdReason: HoldReason | null;
    currentKcal: number;
    limits: { floor: number; fastLossLb: number };
  };
  meals: { repeats: { slug: string; name: string; count: number; rest: boolean }[]; backFromRest: string[] };
}

const CHECKPOINT_WEEK = Number(Object.entries(plan.weekTypes).find(([, type]) => type === "checkpoint")?.[0] ?? 0);

function holdReason(e: EnergyWeek): HoldReason {
  // The first two weeks' windows reach back before the phase.
  if (addDays(e.weekStart, 6 - (WINDOW_DAYS - 1)) < plan.phaseStart) return "first-weeks";
  if (e.trackedDays < MIN_TRACKED_IN_WEEK) return "week-days";
  if (e.windowTrackedDays < MIN_TRACKED_IN_WINDOW) return "window-days";
  if (e.weighIns < MIN_WEIGH_INS) return "weigh-ins";
  // Every count passed, so there was no trend the day before the window.
  return "first-weeks";
}

const lowest = <T>(xs: T[], value: (x: T) => number): T | null => xs.reduce<T | null>((low, x) => (low === null || value(x) < value(low) ? x : low), null);

/**
 * The week under review, in numbers. `today` decides which planned workouts count as missed; it defaults to next
 * Monday, when the whole week is past.
 */
export function buildDigest(rows: Rows, monday: ISODate, choices: CheckInChoices, today: ISODate = addDays(monday, 7)): CheckInDigest {
  const sunday = addDays(monday, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const hungry = hungryTwice(rows, monday, choices.hunger);
  const wc = weekCall(rows, monday, { hungry });
  const number = weekNumber(plan, monday);

  const weights = weighIns(rows, sunday);
  const first = weights.find((w) => w.date >= plan.phaseStart) ?? null;

  const logs = rows("meal_logs");
  const steps = new Map(rows("steps_daily").map((r) => [r.date as ISODate, Number(r.steps)]));
  const weighed = new Set(weights.map((w) => w.date));
  const workouts = loggedDates(rows);
  const desserts = logs.filter((l) => l.category === "dessert" && !Number(l.relaxed)).map((l) => ({ date: l.date as ISODate, at: l.logged_at as string }));
  const over = overAllowanceDates(desserts);
  const facts = days.map((date) => {
    const dayLogs = logs.filter((l) => l.date === date);
    const t = targetsOn(rows, date);
    const proteinG = dayLogs.reduce((n, l) => n + Number(l.protein_g), 0);
    const walked = steps.get(date) ?? 0;
    const relaxed = isRelaxedDay(plan, date);
    return {
      date,
      proteinG,
      steps: walked,
      hasSteps: steps.has(date),
      intake: dayIntake(dayLogs.map((l) => ({ slot: (l.slot as string | null) ?? null, category: l.category as string, kcal: Number(l.kcal) }))),
      counted: countedDay({ weighIn: weighed.has(date), mealLogged: dayLogs.some((l) => l.category !== "skipped"), workout: workouts.has(date), steps: walked, relaxed }),
      full: fullDay({ proteinG, proteinTarget: t.proteinG, steps: walked, stepGoal: t.stepGoal, relaxedDay: relaxed, overAllowance: over.has(date) }),
    };
  });
  const tracked = facts.filter((f) => f.intake !== null);
  const proteinLow = lowest(tracked, (f) => f.proteinG);
  const stepsLow = lowest(
    facts.filter((f) => f.hasSteps),
    (f) => f.steps,
  );
  const weekTargets = targetsOn(rows, sunday);

  const waists = rows("waist_logs")
    .map((r) => ({ date: r.date as ISODate, inches: Number(r.inches) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const now = waists.filter((w) => w.date >= monday && w.date <= sunday).at(-1) ?? null;
  const was = waists.filter((w) => w.date < monday).at(-1) ?? null;

  const repeats = mealRepeats(rows, monday);
  const rest = choices.rest ?? defaultRests(repeats);
  const e = wc.energy;

  return {
    week: { monday, sunday, number, weeksToCheckpoint: CHECKPOINT_WEEK - number },
    weight: {
      trend: wc.trendWeight,
      change: wc.change,
      sinceStart: trendReading(weights, sunday, plan.phaseStart)?.sinceFrom ?? null,
      firstDate: first?.date ?? null,
      firstWeight: first?.weight ?? null,
    },
    days: { counted: facts.filter((f) => f.counted).length, full: facts.filter((f) => f.full).length, tracked: tracked.length, total: 7 },
    protein: {
      avg: tracked.length ? Math.round(tracked.reduce((n, f) => n + f.proteinG, 0) / tracked.length) : null,
      target: weekTargets.proteinG,
      lowDay: proteinLow ? { date: proteinLow.date, grams: proteinLow.proteinG } : null,
    },
    steps: { avg: wc.avgSteps, goal: weekTargets.stepGoal, lowDay: stepsLow ? { date: stepsLow.date, steps: stepsLow.steps } : null },
    intake: { avg: tracked.length ? Math.round(tracked.reduce((n, f) => n + f.intake!, 0) / tracked.length) : null },
    lifts: liftWeek(rows, monday, today),
    waist: { now: now?.inches ?? null, was: was?.inches ?? null, wasDate: was?.date ?? null, change: now && was ? Math.round((now.inches - was.inches) * 100) / 100 : null },
    desserts: { offPlan: desserts.filter((d) => d.date >= monday && d.date <= sunday).length, allowance: DESSERT_ALLOWANCE },
    feel: { hunger: choices.hunger, energy: choices.energy, sleep: choices.sleep, hungryTwice: hungry },
    call: {
      ...wc.call,
      state: e.state,
      burn: e.burn,
      steadyBy: e.state === "settling" ? number + SETTLING_UPDATES - e.updates : null,
      trackedDays: e.trackedDays,
      windowTrackedDays: e.windowTrackedDays,
      weighIns: e.weighIns,
      intakeAvg: e.intakeAvg,
      holdReason: e.state === "holding" ? holdReason(e) : null,
      currentKcal: wc.kcal,
      limits: { floor: KCAL_FLOOR, fastLossLb: FAST_LOSS_LB },
    },
    meals: { repeats: repeats.map((r) => ({ ...r, rest: rest.includes(r.slug) })), backFromRest: backFromRest(rows, monday) },
  };
}

/** Every number a digest holds, as a line may print it: absolute, to 0.1, and each list's length. */
export function digestNumbers(d: CheckInDigest): Set<number> {
  const out = new Set<number>();
  const walk = (v: unknown): void => {
    if (typeof v === "number" && Number.isFinite(v)) {
      out.add(Math.abs(v));
      out.add(Math.abs(Math.round(v * 10) / 10));
    } else if (Array.isArray(v)) {
      out.add(v.length);
      v.forEach(walk);
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(walk);
    }
  };
  walk(d);
  return out;
}

const MONTH_DAY = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}\b/g;

/** The numbers in a line of text, leaving out month-day dates ("Oct 18"). "8,120" reads as 8120. */
export function numbersIn(text: string): number[] {
  return [...text.replace(MONTH_DAY, "").matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, "")));
}
