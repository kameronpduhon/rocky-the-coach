import { SLOTS } from "./types";

/** How fully a day was logged. The engine reads intake only from complete days and days with estimates. */
export type Completeness = "complete" | "estimates" | "partial" | "untracked";

export interface LogFacts {
  slot: string | null;
  category: string;
}

const resolves = (category: string) => category === "planned" || category === "skipped";

export function dayCompleteness(logs: LogFacts[]): Completeness {
  if (logs.length === 0) return "untracked";
  const resolved = new Set(logs.filter((l) => resolves(l.category)).map((l) => l.slot));
  if (!SLOTS.every((s) => resolved.has(s))) return "partial";
  // Every off-plan entry is somebody's estimate, a saved usual order included.
  return logs.some((l) => !resolves(l.category)) ? "estimates" : "complete";
}

export function isTracked(c: Completeness): boolean {
  return c === "complete" || c === "estimates";
}

/** A day's calories, or null when the day wasn't tracked in full. A half-logged day would read as a fast. */
export function dayIntake(logs: (LogFacts & { kcal: number })[]): number | null {
  return isTracked(dayCompleteness(logs)) ? logs.reduce((sum, l) => sum + l.kcal, 0) : null;
}
