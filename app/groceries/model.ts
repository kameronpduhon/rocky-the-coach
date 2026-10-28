// The week's shopping list, worked out from the phone's copy. Pure: the browser and the unit tests both run it.
import { defaultRests, mealRepeats, previewNextWeek } from "~/checkin/meals";
import { foods, meals } from "~/content";
import { factorFor, scaledMeal } from "~/content/scaled";
import { addDays, isISODate, weekStart } from "~/domain/dates";
import { buildGroceryList, SECTION_LABEL, type Section } from "~/domain/groceries";
import type { ISODate } from "~/domain/types";
import { restedOn, targetsOn, type Rows } from "~/today/slots";

const MONTH = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export interface GroceryRow {
  food: string;
  name: string;
  /** "About 24 eggs", or "Cooked weight" for a food weighed cooked. */
  sub: string | null;
  grams: number;
  checked: boolean;
}

export interface GrocerySection {
  section: Section;
  label: string;
  done: number;
  rows: GroceryRow[];
}

export interface GroceriesModel {
  monday: ISODate;
  /** "WEEK OF NOV 2" */
  header: string;
  /** A future week not yet written to the plan, built as the check-in previews it. */
  preview: boolean;
  kcal: number;
  count: number;
  checked: number;
  sections: GrocerySection[];
}

export interface GroceriesAsk {
  week?: string | null;
  /** Slugs to rest in a preview. Null means the check-in's defaults. */
  rest?: string[] | null;
  /** The calories a preview is weighed at, from the check-in's pick. */
  kcal?: string | null;
}

const FOOD_SECTIONS = new Map([...foods].map(([id, f]) => [id, { name: f.name, section: f.section }]));

function subline(foodId: string, grams: number): string | null {
  const f = foods.get(foodId)!;
  const each = f.eachG && f.eachLabel ? Math.round(grams / f.eachG) : 0;
  if (each > 0) return `About ${each} ${f.eachLabel}${each === 1 ? "" : "s"}`;
  return f.state === "cooked" ? "Cooked weight" : null;
}

export function weekGroceries(rows: Rows, today: ISODate, ask: GroceriesAsk = {}): GroceriesModel {
  const monday = isISODate(ask.week) ? weekStart(ask.week) : weekStart(today);
  const sunday = addDays(monday, 6);
  const planned = rows("planned_meals").filter((r) => (r.date as ISODate) >= monday && (r.date as ISODate) <= sunday);
  const future = monday > weekStart(today);
  const preview = planned.length === 0 && future;
  // With no rows yet, the week comes from the rotation as the check-in previews it: the week before it is the one
  // under review. A past or current week rests nothing new, as the server's generator wouldn't, and undoes no rest.
  const before = addDays(monday, -7);
  const rest = future ? (ask.rest ?? defaultRests(mealRepeats(rows, before))) : [...restedOn(rows, monday)];
  const slugs = planned.length > 0 ? planned.map((r) => r.meal_slug as string) : previewNextWeek(rows, before, rest).map((p) => p.slug);
  const asked = Number(ask.kcal);
  const kcal = preview && Number.isInteger(asked) && asked >= 1200 && asked <= 4000 ? asked : targetsOn(rows, monday).kcal;
  const factor = factorFor(kcal);
  const ingredients = new Map([...meals.values()].map((m) => [m.slug, scaledMeal(m, factor).ingredients.map((i) => ({ foodId: i.food, grams: i.grams }))]));
  const checked = new Set(rows("grocery_checks").filter((r) => r.week_start === monday).map((r) => r.food_id as string));
  const sections = buildGroceryList(slugs, ingredients, FOOD_SECTIONS).map((g): GrocerySection => {
    const list = g.items.map((i) => ({ food: i.foodId, name: i.name, sub: subline(i.foodId, i.grams), grams: i.grams, checked: checked.has(i.foodId) }));
    return { section: g.section, label: SECTION_LABEL[g.section], done: list.filter((r) => r.checked).length, rows: list };
  });
  const [, m, d] = monday.split("-").map(Number);
  return {
    monday,
    header: `WEEK OF ${MONTH[m - 1]} ${d}`,
    preview,
    kcal,
    count: sections.reduce((n, s) => n + s.rows.length, 0),
    checked: sections.reduce((n, s) => n + s.done, 0),
    sections,
  };
}
