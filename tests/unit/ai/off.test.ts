import { describe, expect, it } from "vitest";
import { offCode, offUrl, parseOff } from "~/ai/off.server";

const found = (product: Record<string, unknown>, code = "0811620021982") => ({ code, status: 1, status_verbose: "product found", product });

const CORE_POWER = found({
  product_name: "HIGH PROTEIN MILK SHAKE",
  brands: "fa!rlife CORE POWER",
  serving_size: "1 bottle (414 g)",
  serving_quantity: 414,
  categories_tags: ["en:beverages-and-beverages-preparations", "en:beverages", "en:dairies"],
  nutriments: { "energy-kcal_100g": 41.0628019323672, "energy-kcal_serving": 170, proteins_100g: 6.28019323671498, proteins_serving: 26, "energy-kj_100g": 177.657004830918 },
});

describe("offCode and offUrl", () => {
  it("asks for a 12-digit code as 13 digits, with only the fields the card needs", () => {
    expect(offCode("811620021982")).toBe("0811620021982");
    expect(offCode("96385074")).toBe("96385074");
    expect(offUrl("0811620021982")).toBe(
      "https://world.openfoodfacts.org/api/v2/product/0811620021982?fields=code,product_name,brands,serving_size,serving_quantity,nutriments,categories_tags",
    );
  });
});

describe("parseOff", () => {
  it("uses the per-serving numbers when Open Food Facts has them", () => {
    expect(parseOff("0811620021982", CORE_POWER)).toEqual({
      code: "0811620021982",
      name: "fa!rlife CORE POWER HIGH PROTEIN MILK SHAKE",
      servingText: "1 bottle (414 g)",
      kcal: 170,
      proteinG: 26,
      drink: true,
    });
  });

  it("works out a serving from the per-100 g numbers and the serving quantity", () => {
    const cookies = found({
      product_name: "Chocolate chip cookies",
      brands: "Tate's Bake Shop",
      serving_size: "2 cookies (30 g)",
      serving_quantity: "30",
      categories_tags: ["en:snacks"],
      nutriments: { "energy-kcal_100g": 500, proteins_100g: 10 },
    });
    expect(parseOff("0811620021982", cookies)).toMatchObject({ name: "Tate's Bake Shop Chocolate chip cookies", servingText: "2 cookies (30 g)", kcal: 150, proteinG: 3, drink: false });
  });

  it("falls back to per 100 g with no serving, and names a brand once", () => {
    const nutella = found({ product_name: "Nutella", brands: "Nutella, Ferrero", nutriments: { "energy-kcal_100g": 539, proteins_100g: 6.3 } }, "3017620422003");
    expect(parseOff("3017620422003", nutella)).toEqual({ code: "3017620422003", name: "Nutella", servingText: null, kcal: 539, proteinG: 6.3, drink: false });
  });

  it("turns kJ into calories when that is all there is", () => {
    const bar = found({ product_name: "Oat bar", serving_size: "1 bar (50 g)", serving_quantity: 50, nutriments: { "energy-kj_100g": 1000, proteins_100g: 5 } });
    expect(parseOff("0811620021982", bar)).toMatchObject({ kcal: 120, proteinG: 2.5, servingText: "1 bar (50 g)" });
  });

  it("leaves the protein unknown, not 0 g, when Open Food Facts has none for the basis it shows", () => {
    const none = found({ product_name: "Granola", serving_size: "1 cup (50 g)", serving_quantity: 50, nutriments: { "energy-kcal_100g": 450 } });
    expect(parseOff("0811620021982", none)).toMatchObject({ kcal: 225, proteinG: null });
    // Calories per serving, protein only per 100 g, and no serving quantity to scale it by.
    const unscaled = found({ product_name: "Trail mix", serving_size: "1 handful", nutriments: { "energy-kcal_serving": 160, proteins_100g: 15 } });
    expect(parseOff("0811620021982", unscaled)).toMatchObject({ kcal: 160, servingText: "1 handful", proteinG: null });
    const per100 = found({ product_name: "Jam", nutriments: { "energy-kcal_100g": 250 } });
    expect(parseOff("0811620021982", per100)).toMatchObject({ servingText: null, kcal: 250, proteinG: null });
  });

  it("counts a product with no calories as not found", () => {
    expect(parseOff("0811620021982", found({ product_name: "Mystery", nutriments: { proteins_100g: 5 } }))).toBeNull();
  });

  it("counts Open Food Facts' own not-found as not found", () => {
    expect(parseOff("0850000429104", { code: "0850000429104", status: 0, status_verbose: "product not found" })).toBeNull();
  });

  it("keeps a zero-calorie drink, trims the name to 80, and names a nameless product", () => {
    const diet = found({ product_name: "Diet Coke Soft Drink", brands: "Coke", serving_size: "1 can (354.9 mL)", serving_quantity: 354.9, categories_tags: ["en:beverages"], nutriments: { "energy-kcal_100g": 0, "energy-kcal_serving": 0, proteins_100g: 0 } });
    expect(parseOff("0049000028911", diet)).toMatchObject({ kcal: 0, proteinG: 0, drink: true });
    const long = found({ product_name: "x".repeat(120), nutriments: { "energy-kcal_100g": 100 } });
    expect(parseOff("0811620021982", long)!.name).toHaveLength(80);
    expect(parseOff("0811620021982", found({ nutriments: { "energy-kcal_100g": 100 } }))!.name).toBe("Scanned item");
  });
});
