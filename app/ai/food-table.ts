// The food table (content/food-table.json, from USDA FoodData Central). The model maps foods to its ids; the rules
// read its numbers. Runs on the phone and the Worker.
import tableJson from "../../content/food-table.json";
import { FOOD_GROUPS, FoodTableEntrySchema, type FoodGroup, type FoodTableEntry } from "~/content/schema";

export const FOOD_TABLE: readonly FoodTableEntry[] = FoodTableEntrySchema.array().parse(tableJson);
export const FOOD_BY_ID: ReadonlyMap<string, FoodTableEntry> = new Map(FOOD_TABLE.map((f) => [f.id, f]));

export const isFoodId = (id: string): boolean => FOOD_BY_ID.has(id);

/** The picker's group headings, in the table's group order. */
export const GROUP_LABEL: Record<FoodGroup, string> = {
  protein: "Meat, fish and eggs",
  starch: "Rice, pasta and potatoes",
  beans: "Beans",
  "tortilla-bread": "Tortillas and bread",
  vegetable: "Vegetables",
  fruit: "Fruit",
  dairy: "Dairy and cheese",
  "fat-oil": "Oils, nuts and butters",
  sauce: "Sauces and dressings",
  "snack-sweet": "Snacks and sweets",
  drink: "Drinks",
  "fast-food": "Restaurant and fast food",
};

export interface FoodSection {
  group: FoodGroup;
  label: string;
  foods: FoodTableEntry[];
}

/** The picker's list: every word of the query in the name or an alias, within one group or all of them. */
export function searchFoods(query: string, group: FoodGroup | null): FoodSection[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (f: FoodTableEntry) => {
    const text = [f.name, ...f.aliases].join(" ").toLowerCase();
    return words.every((w) => text.includes(w));
  };
  return FOOD_GROUPS.filter((g) => group === null || g === group)
    .map((g) => ({ group: g, label: GROUP_LABEL[g], foods: FOOD_TABLE.filter((f) => f.group === g && hit(f)) }))
    .filter((s) => s.foods.length > 0);
}

/** The describe prompt's cached block. Ids, names, aliases and portions; never a number per 100 g. */
export function foodPromptBlock(): string {
  const lines = FOOD_TABLE.map((f) => `${f.id} | ${f.name} | ${f.aliases.join(", ")} | ${f.portions.map((p) => `${p.label} ${p.g} g`).join(", ")}`);
  return ["Food table. One food per line: id | name | other names | common portions.", ...lines].join("\n");
}
