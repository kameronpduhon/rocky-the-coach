import { addDays } from "./dates";
import type { ISODate } from "./types";

export const TREND_SMOOTHING = 0.1;

/**
 * The trend weight for every day from the first weigh-in through `to`. Each weigh-in pulls the trend a tenth of the way
 * toward it, and a day without one carries the trend over, so a salty day or a skipped weigh-in barely moves it.
 * Unrounded: round only for display.
 */
export function trendSeries(weighIns: { date: ISODate; weight: number }[], to: ISODate): Map<ISODate, number> {
  const byDate = new Map(weighIns.map((w) => [w.date, w.weight]));
  const first = [...byDate.keys()].sort()[0];
  const out = new Map<ISODate, number>();
  if (!first || first > to) return out;
  let trend = byDate.get(first)!;
  for (let d = first; d <= to; d = addDays(d, 1)) {
    const w = byDate.get(d);
    if (w !== undefined) trend += TREND_SMOOTHING * (w - trend);
    out.set(d, trend);
  }
  return out;
}

/** This Sunday's trend minus last Sunday's. Negative is a loss. */
export function weeklyTrendChange(series: Map<ISODate, number>, sunday: ISODate): number | null {
  const now = series.get(sunday);
  const before = series.get(addDays(sunday, -7));
  return now === undefined || before === undefined ? null : now - before;
}

/** Fewer weigh-ins than this in all reads as "Not enough weigh-ins", as v1 did. */
export const MIN_TREND_WEIGH_INS = 3;

/** Pounds to one decimal, for display. */
export const roundLb = (n: number) => Math.round(n * 10) / 10;

export interface TrendReading {
  /** The trend on the date, to 0.1 lb. */
  weight: number;
  /** The change since `from`, to 0.1 lb. Null without `from`, or on or before it. */
  sinceFrom: number | null;
}

/**
 * The trend as Today, Progress and the check-in show it. The change since `from` starts at the trend that day, or at
 * the first weigh-in when that came later.
 */
export function trendReading(weighIns: { date: ISODate; weight: number }[], date: ISODate, from?: ISODate): TrendReading | null {
  if (weighIns.filter((w) => w.date <= date).length < MIN_TREND_WEIGH_INS) return null;
  const series = trendSeries(weighIns, date);
  const now = series.get(date)!;
  if (from === undefined || date <= from) return { weight: roundLb(now), sinceFrom: null };
  const first = series.keys().next().value!;
  const base = series.get(from < first ? first : from)!;
  return { weight: roundLb(now), sinceFrom: roundLb(now - base) };
}
