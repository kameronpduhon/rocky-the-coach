// Everything the Library shows, from the phone's copy. Pure: the browser and the unit tests both run it.
import { BODY_PARTS, exerciseImage, exercises, meals, type BodyPart, type MealWithMacros } from "~/content";
import { factorFor, scaledMeal } from "~/content/scaled";
import { mealDate } from "~/domain/dates";
import type { ISODate } from "~/domain/types";
import { targetsOn, type Rows } from "~/today/slots";
import { usualOrders, type UsualModel } from "~/today/usuals";
import { bestSets, EQUIPMENT, joinAnd, partOf, planLifts, TEMPLATE_DAY } from "~/lifts/model";

const MONTH = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/** Lunch and dinner shows this many, then "Show all 8". */
export const MAINS_SHOWN = 3;

export type MealSectionId = "breakfast" | "main" | "snack" | "dessert" | "weekend";

export interface MealRow {
  slug: string;
  name: string;
  /** "525 cal · 58 g", plus "· ground beef, once a week" on a ground-beef meal. */
  sub: string;
  /** "RESTING TO NOV 8" */
  resting: string | null;
  /** The meal screen, or null without a plan (it is a plan-only screen). */
  to: string | null;
}

export interface MealSection {
  id: MealSectionId;
  label: string;
  rows: MealRow[];
  /** Collapsed sections open in place. Breakfast and lunch and dinner start open. */
  open: boolean;
  /** Rows shown before "Show all", or null for all of them. */
  limit: number | null;
}

export interface ExerciseRow {
  id: string;
  name: string;
  image: string;
  /** "Dumbbells · Monday" in the plan, the equipment otherwise. */
  sub: string;
  /** "55 × 9", or null with no history. */
  best: string | null;
  to: string;
}

export interface ExerciseSection {
  part: BodyPart;
  /** "Chest" */
  label: string;
  /** "4 in plan · 8 swaps", or the count without a plan. */
  note: string;
  open: boolean;
  /** Every row without a plan. */
  rows: ExerciseRow[];
  swaps: ExerciseRow[];
  /** "Swaps: barbell bench press, cable crossover, ..." Null without a plan or with no swaps. */
  swapsLine: string | null;
  /** Searching shows the swap rows without the tap. */
  swapsOpen: boolean;
}

export interface LibraryModel {
  mealCount: number;
  exerciseCount: number;
  meals: MealSection[];
  usuals: UsualModel[];
  exercises: ExerciseSection[];
}

const MEAL_SECTIONS: { id: MealSectionId; label: string; open: boolean; limit: number | null; has: (m: MealWithMacros) => boolean }[] = [
  { id: "breakfast", label: "Breakfast", open: true, limit: null, has: (m) => m.pool === "breakfast" },
  { id: "main", label: "Lunch and dinner", open: true, limit: MAINS_SHOWN, has: (m) => m.pool === "main" && m.mode === "any" },
  { id: "snack", label: "Snacks", open: false, limit: null, has: (m) => m.pool === "snack" },
  { id: "dessert", label: "Desserts", open: false, limit: null, has: (m) => m.pool === "dessert" },
  { id: "weekend", label: "Weekend only", open: false, limit: null, has: (m) => m.pool === "main" && m.mode === "weekend" },
];

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function mealRows(rows: Rows, today: ISODate, hasPlan: boolean): Map<string, MealRow> {
  const factor = hasPlan ? factorFor(targetsOn(rows, today).kcal) : null;
  const resting = new Map(
    rows("meal_state")
      .filter((r) => typeof r.rested_until === "string" && (r.rested_until as string) >= today)
      .map((r) => [r.slug as string, r.rested_until as ISODate]),
  );
  return new Map(
    [...meals.values()].map((raw) => {
      // Without a plan there is no target, so the recipe's own grams.
      const m = factor === null ? raw : scaledMeal(raw, factor);
      const until = resting.get(m.slug);
      return [
        m.slug,
        {
          slug: m.slug,
          name: m.name,
          sub: `${m.kcal} cal · ${m.protein} g${m.tags.includes("ground-beef") ? " · ground beef, once a week" : ""}`,
          resting: until ? `RESTING TO ${MONTH[Number(until.slice(5, 7)) - 1]} ${Number(until.slice(8, 10))}` : null,
          to: hasPlan ? `/meal/${m.slug}?from=library` : null,
        },
      ];
    }),
  );
}

export function buildLibrary(rows: Rows, now: Date, hasPlan: boolean, query = ""): LibraryModel {
  const today = mealDate(now);
  const q = query.trim().toLowerCase();
  const hit = (name: string) => name.toLowerCase().includes(q);
  const searching = q.length > 0;

  const mealsBySlug = mealRows(rows, today, hasPlan);
  const mealSections = MEAL_SECTIONS.map((s) => ({
    id: s.id,
    label: s.label,
    rows: [...meals.values()]
      .filter(s.has)
      .map((m) => mealsBySlug.get(m.slug)!)
      .filter((r) => hit(r.name))
      .sort(byName),
    open: searching || s.open,
    limit: searching ? null : s.limit,
  })).filter((s) => s.rows.length > 0);

  const inPlan = hasPlan ? planLifts(rows) : null;
  const best = bestSets(rows);
  const row = (id: string): ExerciseRow => {
    const ex = exercises.get(id)!;
    const plan = inPlan?.get(id);
    return {
      id,
      name: ex.name,
      image: exerciseImage(ex, 0),
      sub: plan ? `${EQUIPMENT[ex.equipment]} · ${upperFirst(joinAnd(plan.templates.map((t) => TEMPLATE_DAY[t].long)))}` : EQUIPMENT[ex.equipment],
      best: best.get(id) ?? null,
      to: `/lift/${id}?from=library`,
    };
  };
  const exerciseSections = BODY_PARTS.map(({ id: part, label }): ExerciseSection => {
    const all = [...exercises.values()].filter((e) => partOf(e) === part).sort(byName);
    const shown = all.filter((e) => hit(e.name));
    const planned = inPlan ? shown.filter((e) => inPlan.has(e.id)).map((e) => row(e.id)) : shown.map((e) => row(e.id));
    const swaps = inPlan ? shown.filter((e) => !inPlan.has(e.id)).map((e) => row(e.id)) : [];
    const plannedAll = inPlan ? all.filter((e) => inPlan.has(e.id)).length : all.length;
    const swapsAll = all.length - plannedAll;
    return {
      part,
      label,
      note: inPlan ? `${plannedAll} in plan · ${swapsAll} swap${swapsAll === 1 ? "" : "s"}` : String(all.length),
      open: searching || part === "chest",
      rows: planned,
      swaps,
      swapsLine: swaps.length ? `Swaps: ${swaps.map((s) => lowerFirst(s.name)).join(", ")}` : null,
      swapsOpen: searching,
    };
  }).filter((s) => s.rows.length + s.swaps.length > 0);

  return {
    mealCount: meals.size,
    exerciseCount: exercises.size,
    meals: mealSections,
    usuals: usualOrders(rows("usual_orders")).filter((u) => hit(u.name)),
    exercises: exerciseSections,
  };
}
