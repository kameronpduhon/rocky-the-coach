// The plate (option 2A): one row per food the model named, numbers from the food table, never from the model.
import type { FoodTableEntry } from "~/content/schema";

export type Foods = ReadonlyMap<string, FoodTableEntry>;

export interface PlateRow {
  key: string;
  /** The model's words for the food. An unmatched row shows them. */
  label: string;
  /** A food-table id, or null when the table has no match. */
  foodId: string | null;
  grams: number;
  /** Numbers typed on an unmatched row, and the grams showing when they were typed. */
  typed: { kcal: number; protein: number; grams: number } | null;
}

export interface Numbers {
  kcal: number;
  protein: number;
}

const MAX_ITEMS = 12;
const MAX_GRAMS = 2000;
export const OIL_ID = "cooking-oil";
const OIL_GRAMS = 10;

const round5 = (n: number) => Math.round(n / 5) * 5;

const nextKey = (rows: PlateRow[]) => `row-${rows.length}`;

export function startPlate(items: { label: string; foodId: string | null; grams: number }[], foods: Foods): PlateRow[] {
  return items.slice(0, MAX_ITEMS).map((item, i) => ({
    key: `row-${i}`,
    label: item.label,
    foodId: item.foodId !== null && foods.has(item.foodId) ? item.foodId : null,
    grams: Math.min(MAX_GRAMS, Math.max(1, Math.round(item.grams))),
    typed: null,
  }));
}

/** A row's numbers as shown, or null for an unmatched row nobody has typed numbers into yet. */
export function rowNumbers(row: PlateRow, foods: Foods): Numbers | null {
  if (row.grams === 0) return { kcal: 0, protein: 0 };
  const food = row.foodId === null ? undefined : foods.get(row.foodId);
  if (food) return { kcal: round5((row.grams * food.kcalPer100) / 100), protein: Math.round((row.grams * food.proteinPer100) / 100) };
  if (!row.typed) return null;
  if (row.typed.grams === row.grams || row.typed.grams === 0) return { kcal: row.typed.kcal, protein: row.typed.protein };
  const scale = row.grams / row.typed.grams;
  return { kcal: round5(row.typed.kcal * scale), protein: Math.round(row.typed.protein * scale) };
}

/** The sum of the rows as shown, so the numbers on screen add up. */
export function plateTotal(rows: PlateRow[], foods: Foods): Numbers {
  return rows.reduce((t, r) => {
    const n = rowNumbers(r, foods);
    return n ? { kcal: t.kcal + n.kcal, protein: t.protein + n.protein } : t;
  }, { kcal: 0, protein: 0 });
}

export function uncountedNote(rows: PlateRow[], foods: Foods): string | null {
  const left = rows.filter((r) => rowNumbers(r, foods) === null);
  if (left.length === 0) return null;
  return left.length === 1 ? `${left[0]!.label} isn't counted until it has numbers.` : `${left.length} foods aren't counted until they have numbers.`;
}

export const stepUp = (g: number): number => Math.min(MAX_GRAMS, g + (g < 50 ? 5 : 10));
export const stepDown = (g: number): number => Math.max(0, g - (g <= 50 ? 5 : 10));

const update = (rows: PlateRow[], key: string, change: (r: PlateRow) => PlateRow) => rows.map((r) => (r.key === key ? change(r) : r));

export function setGrams(rows: PlateRow[], key: string, grams: number): PlateRow[] {
  return update(rows, key, (r) => ({ ...r, grams }));
}

/** The Cal and Protein g fields on an unmatched row. No calories means no numbers yet. */
export function typeNumbers(rows: PlateRow[], key: string, typed: { kcal: number | null; protein: number | null }): PlateRow[] {
  return update(rows, key, (r) => ({ ...r, typed: typed.kcal === null ? null : { kcal: Math.round(typed.kcal), protein: Math.round(typed.protein ?? 0), grams: r.grams } }));
}

export function addOil(rows: PlateRow[], foods: Foods): PlateRow[] {
  const oil = rows.find((r) => r.foodId === OIL_ID);
  if (oil) return setGrams(rows, oil.key, Math.min(MAX_GRAMS, oil.grams + OIL_GRAMS));
  return [...rows, { key: nextKey(rows), label: foods.get(OIL_ID)?.name ?? "Cooking oil", foodId: OIL_ID, grams: OIL_GRAMS, typed: null }];
}

/** A food from "+ sauce" or "+ drink", at its first portion. */
export function addFood(rows: PlateRow[], food: FoodTableEntry): PlateRow[] {
  return [...rows, { key: nextKey(rows), label: food.name, foodId: food.id, grams: Math.round(food.portions[0]!.g), typed: null }];
}

/** "Pick a food" on an unmatched row: the picked food at the same grams. */
export function pickFood(rows: PlateRow[], key: string, food: FoodTableEntry): PlateRow[] {
  return update(rows, key, (r) => ({ ...r, label: food.name, foodId: food.id, typed: null }));
}
