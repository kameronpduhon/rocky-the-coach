import { addDays } from "./dates";
import { STEP_CAP } from "./steps";
import type { ISODate } from "./types";

export type BurnState = "settling" | "updating" | "holding";

export const KCAL_PER_LB = 3500;
export const WINDOW_DAYS = 21;
export const MIN_TRACKED_IN_WINDOW = 10;
export const MIN_TRACKED_IN_WEEK = 4;
export const MIN_WEIGH_INS = 8;
const SMOOTHING = 0.5;
const MAX_BURN_MOVE = 250;
export const SETTLING_UPDATES = 4;
/** The most the target moves in a week while the burn is settling, and after. */
export const SETTLING_CAP = 100;
export const SETTLED_CAP = 150;

export interface EnergyInput {
  /** The Monday the phase began. */
  phaseStart: ISODate;
  /** The Monday of the last week to work out: the week under review. */
  through: ISODate;
  /** The burn before any week updates: the plan's starting estimate. */
  priorBurn: number;
  /** A tracked day's calories, or null for a day that wasn't tracked in full. */
  intake: (d: ISODate) => number | null;
  trend: (d: ISODate) => number | null;
  weighedIn: (d: ISODate) => boolean;
}

export interface EnergyWeek {
  weekStart: ISODate;
  /** kcal a day, rounded to 10. */
  burn: number;
  state: BurnState;
  /** Weeks that have updated so far, this one included. The fourth is the last that settles. */
  updates: number;
  observed: number | null;
  /** Average calories over the window's tracked days, rounded. */
  intakeAvg: number | null;
  /** Tracked days in this Monday-to-Sunday week. */
  trackedDays: number;
  windowTrackedDays: number;
  weighIns: number;
  /** The trend the day before the window starts, and on its last day (Sunday). */
  trendStart: number | null;
  trendEnd: number | null;
}

/**
 * The burn, week by week from the phase start. Eating minus the energy the trend says was stored or lost is what was
 * burned. Each week moves halfway toward that and at most 250, so one odd week can't swing the targets. Nothing is
 * stored: the whole history is worked out again each time.
 */
export function energyHistory(input: EnergyInput): EnergyWeek[] {
  const out: EnergyWeek[] = [];
  let burn = input.priorBurn;
  let updates = 0;
  for (let monday = input.phaseStart; monday <= input.through; monday = addDays(monday, 7)) {
    const sunday = addDays(monday, 6);
    const start = addDays(sunday, -(WINDOW_DAYS - 1));
    const days = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(start, i));
    const tracked = days.flatMap((d) => {
      const kcal = input.intake(d);
      return kcal === null ? [] : [{ d, kcal }];
    });
    const trackedDays = tracked.filter((t) => t.d >= monday).length;
    const weighIns = days.filter(input.weighedIn).length;
    // The spec's slope: from the trend the day before the window to its last day, over the window's 21 days.
    const trendStart = input.trend(addDays(start, -1));
    const trendEnd = input.trend(sunday);
    const intakeAvg = tracked.length ? tracked.reduce((sum, t) => sum + t.kcal, 0) / tracked.length : null;

    const enough =
      start >= input.phaseStart &&
      tracked.length >= MIN_TRACKED_IN_WINDOW &&
      trackedDays >= MIN_TRACKED_IN_WEEK &&
      weighIns >= MIN_WEIGH_INS &&
      intakeAvg !== null &&
      trendStart !== null &&
      trendEnd !== null;
    let observed: number | null = null;
    if (enough) {
      observed = intakeAvg - (KCAL_PER_LB * (trendEnd - trendStart)) / WINDOW_DAYS;
      const move = Math.max(-MAX_BURN_MOVE, Math.min(MAX_BURN_MOVE, SMOOTHING * (observed - burn)));
      burn = Math.round((burn + move) / 10) * 10;
      updates++;
    }
    out.push({
      weekStart: monday,
      burn,
      state: !enough ? "holding" : updates <= SETTLING_UPDATES ? "settling" : "updating",
      updates,
      observed,
      intakeAvg: intakeAvg === null ? null : Math.round(intakeAvg),
      trackedDays,
      windowTrackedDays: tracked.length,
      weighIns,
      trendStart,
      trendEnd,
    });
  }
  return out;
}

export const KCAL_FLOOR = 2000;
/** The goal pace: 0.5% of trend weight a week. */
export const GOAL_RATE = 0.005;

/** Losing more than this two weeks running holds a cut (the fast-loss guardrail). */
export const FAST_LOSS_LB = 2;
const STEP_BUMP = 1000;

export interface CallInput {
  week: EnergyWeek;
  trendWeight: number;
  /** The base calorie target now. */
  currentKcal: number;
  /** Next week's step goal, after v1's ramp. */
  stepGoal: number;
  /** The step goal now, before the ramp. Walking more adds 1,000 to it, as v1 did. */
  baseStepGoal: number;
  /** This week's and last week's trend change in lb. Negative is a loss. */
  changes: [number | null, number | null];
  maintenanceNext: boolean;
  /** The lowest target that keeps flex foods at half portions (HALF_PORTION_KCAL). */
  halfPortionKcal: number;
  /** Hunger was High at this check-in and the last one: Rocky picks walking over a cut. */
  hungry: boolean;
}

export type CallKind = "hold" | "cut" | "raise" | "on-pace" | "maintenance";
export type Guardrail = "fast-loss" | "no-surplus" | "floor" | "half-portions";

export interface CallOption {
  kcal: number;
  stepGoal: number;
}

export interface Call {
  kind: CallKind;
  /** Burn minus the goal deficit, rounded down to 50, so it never asks for a surplus. Null when holding. */
  ideal: number | null;
  goalLbPerWeek: number;
  guardrail: Guardrail | null;
  /** Rocky's calorie move. On a hold it keeps today's numbers. */
  calories: CallOption;
  /** Keep the calories and walk 1,000 more. Only offered with a cut, or at half portions, while steps are under 10,000. */
  steps: CallOption | null;
  pick: "calories" | "steps";
  /** What the maintenance week eats: the burn as stored. The base target stays as it is. */
  maintenanceKcal: number | null;
  /** True when two hungry Sundays moved Rocky's pick from calories to steps. The numbers are the same either way. */
  hungry: boolean;
}

const floor50 = (n: number) => Math.floor(n / 50) * 50;

export function nextTarget(input: CallInput): Call {
  const { week, currentKcal, stepGoal } = input;
  const goalLbPerWeek = GOAL_RATE * input.trendWeight;
  const keep: CallOption = { kcal: currentKcal, stepGoal };
  const base = { goalLbPerWeek, guardrail: null, calories: keep, steps: null, pick: "calories" as const, maintenanceKcal: null, hungry: false };
  if (input.maintenanceNext) return { ...base, kind: "maintenance", ideal: null, maintenanceKcal: week.burn };
  if (week.state === "holding") return { ...base, kind: "hold", ideal: null };

  const ideal = floor50(week.burn - (goalLbPerWeek * KCAL_PER_LB) / 7);
  const cap = week.state === "settling" ? SETTLING_CAP : SETTLED_CAP;
  let kcal = currentKcal + Math.max(-cap, Math.min(cap, ideal - currentKcal));
  let guardrail: Guardrail | null = null;

  const [thisWeek, lastWeek] = input.changes;
  if (kcal < currentKcal && thisWeek !== null && lastWeek !== null && thisWeek < -FAST_LOSS_LB && lastWeek < -FAST_LOSS_LB) {
    kcal = currentKcal;
    guardrail = "fast-loss";
  }
  if (kcal > week.burn) {
    // The rounded-down ideal sits under the burn, but a capped move from above can stop short of it.
    kcal = floor50(week.burn);
    guardrail = "no-surplus";
  }
  if (kcal < KCAL_FLOOR) {
    kcal = KCAL_FLOOR;
    guardrail = "floor";
  }
  // Walking more doesn't stack on the ramp: it offers this week's goal plus 1,000, and only if that beats the ramp.
  const walkGoal = Math.min(STEP_CAP, Math.max(stepGoal, input.baseStepGoal + STEP_BUMP));
  const walkMore = walkGoal > stepGoal ? { kcal: currentKcal, stepGoal: walkGoal } : null;
  let pick: Call["pick"] = "calories";
  if (kcal < input.halfPortionKcal) {
    // Past half portions the food can't give more, so the rest of the cut comes from walking.
    kcal = Math.min(currentKcal, input.halfPortionKcal);
    guardrail = "half-portions";
    if (walkMore) pick = "steps";
  }

  const kind: CallKind = kcal < currentKcal ? "cut" : kcal > currentKcal ? "raise" : guardrail ? "hold" : "on-pace";
  const steps = kcal < currentKcal || guardrail === "half-portions" ? walkMore : null;
  // Two hungry Sundays running: walking takes over a cut, when walking is on offer. Nothing else changes.
  const hungry = input.hungry && kind === "cut" && pick === "calories" && steps !== null;
  return { ...base, kind, ideal, guardrail, calories: { kcal, stepGoal }, steps, pick: hungry ? "steps" : pick, hungry };
}
