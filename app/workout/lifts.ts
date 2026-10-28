// A day's lift list (spec section 1, "Lift list"): reading it, and the edits the plan screen makes. Pure.
import { exerciseImage, exercises, plan } from "~/content";
import type { Exercise } from "~/content/schema";
import { CUSTOM_WORKOUT, type ISODate } from "~/domain/types";
import type { Row } from "~/sync/tables";
import type { Rows } from "./sessions";

export interface Lift {
  position: number;
  exercise: string;
  repMin: number;
  repMax: number;
  from: "plan" | "swap" | "added";
  replaces?: string;
}

/** Added lifts number from here, so they never take a template's place. */
export const ADDED_FROM = 100;
const ADDED_REPS = { repMin: 8, repMax: 12 };

const n = (r: Row, c: string) => Number(r[c] ?? 0);

export function workoutTitle(templateId: string): string {
  if (templateId === CUSTOM_WORKOUT) return "Your own";
  if (templateId === plan.planB) return "Short, Home";
  return plan.templates[templateId]?.name ?? "Workout";
}

/** "Legs, Shoulders" as poster lines: "Legs." and "Shoulders." */
export function titleLines(title: string): string[] {
  return title.split(/, | and /).map((part) => `${part}.`);
}

/** The picker's label, in sentence case: "Legs, shoulders". */
export function choiceLabel(templateId: string): string {
  const title = workoutTitle(templateId);
  return title.charAt(0) + title.slice(1).toLowerCase();
}

function parseLifts(raw: unknown): Lift[] {
  try {
    const list: unknown = JSON.parse(String(raw));
    // A lift whose exercise has left the library is dropped rather than breaking the screen.
    return Array.isArray(list) ? (list as Lift[]).filter((l) => exercises.has(l.exercise)) : [];
  } catch {
    return [];
  }
}

/** The day's own list when it has one, else the template with its always-swaps (and a v1 swap made that day). */
export function resolveLifts(rows: Rows, session: Row | null, templateId: string, date: ISODate): Lift[] {
  if (session?.lifts) return parseLifts(session.lifts);
  const template = plan.templates[templateId];
  if (!template) return [];
  const overrides = rows("exercise_overrides").filter((r) => r.template_id === templateId);
  const swaps = rows("exercise_swaps").filter((r) => r.template_id === templateId && r.date === date);
  return template.exercises.map((e, position): Lift => {
    const chosen = (swaps.find((r) => n(r, "position") === position) ?? overrides.find((r) => n(r, "position") === position))?.exercise_id as string | undefined;
    return { position, exercise: chosen && exercises.has(chosen) ? chosen : e.exercise, repMin: e.repMin, repMax: e.repMax, from: "plan" };
  });
}

/** Swap a lift for today only. Swapping back to the original is the same as Undo. */
export function swapToday(list: Lift[], position: number, exercise: string): Lift[] {
  return list.map((l) => {
    if (l.position !== position) return l;
    if (l.from === "added") return { ...l, exercise };
    const original = l.replaces ?? l.exercise;
    if (exercise === original) return { position, exercise, repMin: l.repMin, repMax: l.repMax, from: "plan" };
    return { position, exercise, repMin: l.repMin, repMax: l.repMax, from: "swap", replaces: original };
  });
}

export function undoSwap(list: Lift[], position: number): Lift[] {
  return list.map((l) => (l.position === position && l.from === "swap" && l.replaces ? { position, exercise: l.replaces, repMin: l.repMin, repMax: l.repMax, from: "plan" } : l));
}

/** The lift after a swap-always: the template's new pick, so a plan lift again. */
export function swapForGood(list: Lift[], position: number, exercise: string): Lift[] {
  return list.map((l) => (l.position === position ? { position, exercise, repMin: l.repMin, repMax: l.repMax, from: "plan" } : l));
}

/** Skip or remove a lift. Nothing is renumbered, so logged sets keep pointing at their lift. */
export function dropLift(list: Lift[], position: number): Lift[] {
  return list.filter((l) => l.position !== position);
}

export function addLifts(list: Lift[], ids: string[]): Lift[] {
  let next = Math.max(ADDED_FROM - 1, ...list.map((l) => l.position)) + 1;
  const have = new Set(list.map((l) => l.exercise));
  const added = [...new Set(ids)].filter((id) => exercises.has(id) && !have.has(id)).map((exercise): Lift => ({ position: next++, exercise, ...ADDED_REPS, from: "added" }));
  return [...list, ...added];
}

/** What a lift can be swapped for: the same muscle, and nothing already in today's list. */
export function swapOptions(list: Lift[], position: number): Exercise[] {
  const lift = list.find((l) => l.position === position);
  const group = lift ? exercises.get(lift.replaces ?? lift.exercise)?.group : undefined;
  const inUse = new Set(list.map((l) => l.exercise));
  return [...exercises.values()].filter((e) => e.group === group && !inUse.has(e.id)).sort((a, b) => a.name.localeCompare(b.name));
}

/** About how long a workout takes: 5 minutes to warm up, then 3.5 a set with its rest, to the nearest 5. */
export function workoutMinutes(sets: number): number {
  return Math.round((5 + sets * 3.5) / 5) * 5;
}

/** Every exercise for the add-a-lift picker, by name. */
export const CATALOG = [...exercises.values()]
  .map((e) => ({ id: e.id, name: e.name, group: e.group, equipment: e.equipment, image: exerciseImage(e, 0) }))
  .sort((a, b) => a.name.localeCompare(b.name));
