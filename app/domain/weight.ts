import { addDays } from './dates';
import type { ISODate } from './types';

const round1 = (n: number) => Math.round(n * 10) / 10;

export function sevenDayAverage(weighIns: { date: ISODate; weight: number }[], date: ISODate): number | null {
  const from = addDays(date, -6);
  const window = weighIns.filter((w) => w.date >= from && w.date <= date);
  if (window.length < 3) return null;
  return round1(window.reduce((sum, w) => sum + w.weight, 0) / window.length);
}

export function weeklyChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return round1(current - previous);
}
