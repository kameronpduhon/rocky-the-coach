// The "Was" line: for 7 days after the calorie target moves, a flex food shows what it weighed before, and the meal
// screen says why. Spec section 2.
import { weekType } from "~/domain/calendar";
import { addDays, weekday } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import { foods, plan } from "./index";
import { resolveTargets, type BurnEntry, type TargetEntry } from "./targets";

export const WAS_DAYS = 7;

export interface TargetChange {
  /** The first day of the new target. */
  on: ISODate;
  fromKcal: number;
  toKcal: number;
  /** A maintenance week starting or ending, rather than a check-in. */
  maintenance: "start" | "end" | null;
}

/** The latest change to the day's calorie target in the 7 days up to and including `date`. */
export function recentTargetChange(entries: TargetEntry[], date: ISODate, burns: BurnEntry[]): TargetChange | null {
  const maintenance = (d: ISODate) => weekType(plan, d) === "maintenance";
  for (let i = 0; i < WAS_DAYS; i++) {
    const on = addDays(date, -i);
    const before = addDays(on, -1);
    const toKcal = resolveTargets(entries, on, burns).kcal;
    const fromKcal = resolveTargets(entries, before, burns).kcal;
    if (toKcal === fromKcal) continue;
    return { on, fromKcal, toKcal, maintenance: maintenance(on) && !maintenance(before) ? "start" : !maintenance(on) && maintenance(before) ? "end" : null };
  }
  return null;
}

const SHORT: Record<string, string> = { "white-rice-cooked": "rice", "potato-russet-raw": "potato", "sweet-potato-raw": "sweet potato" };

/** How a flex food is named in a sentence: "rice", "potato", "honey". */
export function flexName(foodId: string): string {
  return SHORT[foodId] ?? foods.get(foodId)!.name.toLowerCase();
}

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Why the grams moved, naming at most two of the meal's flex foods that changed. */
export function wasReason(change: TargetChange, foodIds: string[]): string {
  const names = [...new Set(foodIds.map(flexName))].slice(0, 2);
  const what = names.join(" and ");
  const many = names.length > 1;
  const n = Math.abs(change.toKcal - change.fromKcal).toLocaleString("en-US");
  if (change.maintenance === "start") return `Maintenance week adds ${n} cal a day, so ${what} ${many ? "go" : "goes"} up.`;
  if (change.maintenance === "end") return `Maintenance week is over, so ${what} ${many ? "come" : "comes"} back down.`;
  // Targets change on the Monday after the Sunday check-in.
  const checkIn = `${DAY[weekday(addDays(change.on, -1))]}'s check-in`;
  return change.toKcal < change.fromKcal
    ? `${checkIn} trimmed ${n} cal a day, so ${what} took the cut.`
    : `${checkIn} added ${n} cal a day, so ${what} ${many ? "go" : "goes"} up.`;
}
