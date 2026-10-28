// Closing out a day: every meal not yet marked, asked about at bedtime and once the next morning (option 1C).
import { dayCompleteness } from "~/domain/completeness";
import { addDays, weekday } from "~/domain/dates";
import type { ISODate, Slot } from "~/domain/types";
import { DAY_NAME, daySlots, SLOT_LABEL, type DaySlot, type Rows } from "./slots";

export interface CloseOutRow {
  slot: Slot;
  mealSlug: string;
  name: string;
  /** "Dinner · 570 cal · 54 g" */
  sub: string;
}

export interface CloseOutModel {
  date: ISODate;
  title: string;
  rows: CloseOutRow[];
}

function unmarked(slots: DaySlot[]): CloseOutRow[] {
  return slots
    .filter((s) => s.logKey === null && s.skipKey === null)
    .map((s) => ({ slot: s.slot, mealSlug: s.meal.slug, name: s.meal.name, sub: `${SLOT_LABEL[s.slot]} · ${s.meal.kcal} cal · ${s.meal.protein} g` }));
}

/** Today while a meal is unmarked, and yesterday while it is half answered. A day with nothing logged is never asked about. */
export function closeOutDays(rows: Rows, today: ISODate, todaySlots: DaySlot[]): { today: CloseOutModel | null; yesterday: CloseOutModel | null } {
  const todayRows = unmarked(todaySlots);
  const y = addDays(today, -1);
  const yLogs = rows("meal_logs")
    .filter((r) => r.date === y)
    .map((r) => ({ slot: (r.slot as string | null) ?? null, category: r.category as string }));
  return {
    today: todayRows.length ? { date: today, title: `Close out ${DAY_NAME[weekday(today)]}`, rows: todayRows } : null,
    yesterday: dayCompleteness(yLogs) === "partial" ? { date: y, title: "Close out yesterday", rows: unmarked(daySlots(rows, y)) } : null,
  };
}

/** The red button says what Save will record. */
export function closeOutLabel(eaten: number, skipped: number): string {
  const total = eaten + skipped;
  if (skipped === 0) return total === 1 ? "Save: eaten" : total === 2 ? "Save: both eaten" : `Save: all ${total} eaten`;
  if (eaten === 0) return total === 1 ? "Save: skipped" : "Save: all skipped";
  return `Save: ${eaten} eaten, ${skipped} skipped`;
}
