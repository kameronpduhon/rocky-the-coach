import type { ISODate } from './types';

export const TZ = 'America/Chicago';

function parts(now: Date, tz: string) {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)) {
    out[p.type] = p.value;
  }
  return out;
}

export function localDate(now: Date = new Date(), tz: string = TZ): ISODate {
  const p = parts(now, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

export function localMinutes(now: Date = new Date(), tz: string = TZ): number {
  const p = parts(now, tz);
  return Number(p.hour) * 60 + Number(p.minute);
}

function toUTC(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

/** A real calendar date in YYYY-MM-DD form. */
export function isISODate(s: unknown): s is ISODate {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && addDays(s, 0) === s;
}

export function addDays(d: ISODate, n: number): ISODate {
  return new Date(toUTC(d) + n * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(d: ISODate): number {
  return new Date(toUTC(d)).getUTCDay();
}

export function weekStart(d: ISODate): ISODate {
  return addDays(d, -((weekday(d) + 6) % 7));
}

/** Late-night logging (before 3am) belongs to the previous day. */
export function mealDate(now: Date = new Date(), tz: string = TZ): ISODate {
  const today = localDate(now, tz);
  return localMinutes(now, tz) < 180 ? addDays(today, -1) : today;
}

export function formatTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h24 >= 12 ? 'pm' : 'am';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h}${suffix}` : `${h}:${String(m).padStart(2, '0')}${suffix}`;
}

/** Clock time that always shows minutes ("2:00pm"), for scheduled times shown in lists. */
export function formatClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(minutes % 60).padStart(2, '0')}${h24 >= 12 ? 'pm' : 'am'}`;
}

export function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
