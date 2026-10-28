import { describe, expect, it } from "vitest";
import { groceryList, type GroceryList } from "~/server/groceries.server";
import { setTargetsFrom } from "~/server/targets.server";
import { db } from "./helpers";

const grams = (l: GroceryList, foodId: string) => l.groups.flatMap((g) => g.items).find((i) => i.foodId === foodId)?.grams ?? 0;

describe("grocery list", () => {
  it("lists the week at the trimmed grams, with protein unchanged", async () => {
    const monday = "2026-11-09";
    const before = await groceryList(db(), monday, monday, { rest: null, swaps: [] });
    await setTargetsFrom(db(), monday, { kcal: 2300, proteinG: 180, stepGoal: 7000 });
    const after = await groceryList(db(), monday, monday, { rest: null, swaps: [] });
    expect(grams(before, "white-rice-cooked")).toBeGreaterThan(0);
    expect(grams(after, "white-rice-cooked")).toBeLessThan(grams(before, "white-rice-cooked"));
    for (const id of ["chicken-breast-raw", "sirloin-raw", "egg-whole"]) expect(grams(after, id), id).toBe(grams(before, id));
  });
});
