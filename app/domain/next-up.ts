import type { Slot } from "./types";

export type NextUp =
  | { kind: "check-in" }
  | { kind: "workout"; templateId: string; started: boolean }
  | { kind: "meal"; slot: Slot }
  | { kind: "steps"; left: number }
  | { kind: "done" }
  | { kind: "no-plan" };

export interface NextUpDay {
  hasPlan: boolean;
  /** Minutes since midnight of the meal day. Late night (before 3am) runs past 24:00. */
  minutes: number;
  checkInOpen: boolean;
  /** In time order. */
  slots: { slot: Slot; minutes: number; eaten: boolean }[];
  workout: { templateId: string; started: boolean; finished: boolean } | null;
  steps: number;
  stepGoal: number;
}

export const WORKOUT_START = 12 * 60;
/** A workout never started stops being "next" when its plan window closes. */
export const WORKOUT_CLOSE = 14 * 60;
const DAY_END = 27 * 60;

/** The one thing Today's poster is about. */
export function nextUp(day: NextUpDay): NextUp {
  if (!day.hasPlan) return { kind: "no-plan" };
  if (day.checkInOpen) return { kind: "check-in" };
  const items: { at: number; ends: number; done: boolean; up: NextUp }[] = day.slots.map((s, i) => ({
    at: s.minutes,
    ends: day.slots[i + 1]?.minutes ?? DAY_END,
    done: s.eaten,
    up: { kind: "meal", slot: s.slot },
  }));
  if (day.workout) {
    const w = day.workout;
    items.push({ at: WORKOUT_START, ends: w.started ? Infinity : WORKOUT_CLOSE, done: w.finished, up: { kind: "workout", templateId: w.templateId, started: w.started } });
  }
  items.sort((a, b) => a.at - b.at);
  const current = items.find((i) => !i.done && day.minutes < i.ends);
  if (current) return current.up;
  if (day.steps < day.stepGoal) return { kind: "steps", left: day.stepGoal - day.steps };
  return { kind: "done" };
}
