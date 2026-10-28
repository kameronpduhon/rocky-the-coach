import { describe, expect, it } from "vitest";
import { buildFoodTable, energyKcal, numbersOf, readChecked } from "../../scripts/build-food-table";

const n = (number: string, amount: number) => ({ nutrient: { number }, amount });
const BEANS = { fdcId: 175237, foodNutrients: [n("208", 132), n("268", 552), n("203", 8.86)] };
const LETTUCE = { fdcId: 2346391, foodNutrients: [n("203", 1.09), n("957", 22), n("958", 18.5)] };

describe("energyKcal", () => {
  it("reads Energy (208) first", () => {
    expect(energyKcal(BEANS.foodNutrients)).toBe(132);
  });

  it("reads Atwater General (957) before Atwater Specific (958) for Foundation foods", () => {
    expect(energyKcal(LETTUCE.foodNutrients)).toBe(22);
    expect(energyKcal([n("958", 80.95)])).toBe(80.95);
  });

  it("turns kJ into calories when that is all there is, and gives up with nothing", () => {
    expect(energyKcal([n("268", 1000)])).toBeCloseTo(239.006, 3);
    expect(energyKcal([n("203", 5)])).toBeUndefined();
  });
});

describe("numbersOf", () => {
  it("rounds calories to whole numbers and protein to 2 decimals", () => {
    expect(numbersOf(BEANS)).toEqual({ kcalPer100: 132, proteinPer100: 8.86 });
    expect(numbersOf({ fdcId: 2346401, foodNutrients: [n("957", 83.42), n("203", 2.27375)] })).toEqual({ kcalPer100: 83, proteinPer100: 2.27 });
  });

  it("needs both calories and protein", () => {
    expect(numbersOf({ fdcId: 1, foodNutrients: [n("208", 50)] })).toBeUndefined();
  });
});

describe("buildFoodTable", () => {
  const source = [
    { id: "black-beans-cooked", name: "Black beans", aliases: ["black beans"], group: "beans" as const, fdcId: 175237, source: "sr-legacy" as const, portions: [{ label: "0.5 cup", g: 86 }] },
    { id: "lettuce-green-leaf", name: "Green leaf lettuce", aliases: ["lettuce"], group: "vegetable" as const, fdcId: 2346391, source: "foundation" as const, portions: [{ label: "1 cup", g: 36 }] },
  ];

  it("fills each entry's numbers in the source's order", () => {
    const table = buildFoodTable(source, new Map([[2346391, { kcalPer100: 22, proteinPer100: 1.09 }], [175237, { kcalPer100: 132, proteinPer100: 8.86 }]]));
    expect(table.map((f) => [f.id, f.kcalPer100, f.proteinPer100])).toEqual([
      ["black-beans-cooked", 132, 8.86],
      ["lettuce-green-leaf", 22, 1.09],
    ]);
    expect(table[0]).toMatchObject({ name: "Black beans", fdcId: 175237, source: "sr-legacy", portions: [{ label: "0.5 cup", g: 86 }] });
  });

  it("refuses to write a table with a food FDC didn't give numbers for", () => {
    expect(() => buildFoodTable(source, new Map([[175237, { kcalPer100: 132, proteinPer100: 8.86 }]]))).toThrow("No FDC numbers for: lettuce-green-leaf (2346391)");
  });
});

describe("readChecked", () => {
  it("reads the plan's checked list by fdcId", () => {
    const tsv = "id\tfdcId\tkcalPer100\tproteinPer100\nblack-beans-cooked\t175237\t132\t8.86\nlettuce-green-leaf\t2346391\t22\t1.09\n";
    expect(readChecked(tsv)).toEqual(new Map([[175237, { kcalPer100: 132, proteinPer100: 8.86 }], [2346391, { kcalPer100: 22, proteinPer100: 1.09 }]]));
  });
});
