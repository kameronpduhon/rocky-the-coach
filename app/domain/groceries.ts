export type Section = 'meat-seafood' | 'dairy-eggs' | 'produce' | 'pantry';
export const SECTION_ORDER: Section[] = ['meat-seafood', 'dairy-eggs', 'produce', 'pantry'];
export const SECTION_LABEL: Record<Section, string> = {
  'meat-seafood': 'Meat and seafood',
  'dairy-eggs': 'Dairy and eggs',
  produce: 'Produce',
  pantry: 'Pantry',
};

export interface GroceryFood {
  name: string;
  section: Section;
}

export interface GroceryItem {
  foodId: string;
  name: string;
  grams: number;
}

export function friendlyGrams(g: number): number {
  return g > 200 ? Math.round(g / 50) * 50 : Math.round(g / 5) * 5;
}

/** plannedSlugs: one entry per planned portion for the week. */
export function buildGroceryList(
  plannedSlugs: string[],
  ingredientsBySlug: Map<string, { foodId: string; grams: number }[]>,
  foods: Map<string, GroceryFood>,
): { section: Section; items: GroceryItem[] }[] {
  const totals = new Map<string, number>();
  for (const slug of plannedSlugs) {
    for (const ing of ingredientsBySlug.get(slug) ?? []) {
      totals.set(ing.foodId, (totals.get(ing.foodId) ?? 0) + ing.grams);
    }
  }
  return SECTION_ORDER.map((section) => ({
    section,
    items: [...totals.entries()]
      .filter(([id]) => foods.get(id)?.section === section)
      .map(([id, grams]) => ({ foodId: id, name: foods.get(id)!.name, grams: friendlyGrams(grams) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((group) => group.items.length > 0);
}
