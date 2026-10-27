import { addDays, localDate, localMinutes, weekStart, weekday } from "./dates";
import type { ISODate } from "./types";

/** The Monday of the week under review while the check-in is open (Sunday 5pm to Monday noon), else null. */
export function checkInWindow(now: Date): ISODate | null {
  const today = localDate(now);
  const minutes = localMinutes(now);
  const wd = weekday(today);
  if (wd === 0 && minutes >= 17 * 60) return weekStart(today);
  if (wd === 1 && minutes < 12 * 60) return addDays(weekStart(today), -7);
  return null;
}
