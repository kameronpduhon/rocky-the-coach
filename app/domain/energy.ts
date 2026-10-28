import { addDays } from "./dates";
import type { ISODate } from "./types";

export type BurnState = "settling" | "updating" | "holding";

export const KCAL_PER_LB = 3500;
const WINDOW_DAYS = 21;
const MIN_TRACKED_IN_WINDOW = 10;
const MIN_TRACKED_IN_WEEK = 4;
const MIN_WEIGH_INS = 8;
const SMOOTHING = 0.5;
const MAX_BURN_MOVE = 250;
const SETTLING_UPDATES = 4;

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
    const trendStart = input.trend(start);
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
      observed = intakeAvg - (KCAL_PER_LB * (trendEnd - trendStart)) / (WINDOW_DAYS - 1);
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
