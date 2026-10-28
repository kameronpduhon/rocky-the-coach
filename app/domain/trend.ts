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
