import { describe, expect, it } from "vitest";
import { DescribeSchema, NO_PLATE, tidyDescribe } from "~/ai/describe";

const known = (id: string) => id === "white-rice-cooked" || id === "black-beans-cooked";

describe("DescribeSchema", () => {
  it("is a name, a category and foods with grams and an id or null, nothing else", () => {
    const reply = { name: "Chipotle bowl", category: "meal", items: [{ label: "Black beans", foodId: "black-beans-cooked", grams: 120 }, { label: "Pupusa", foodId: null, grams: 150 }] };
    expect(DescribeSchema.parse(reply)).toEqual(reply);
    expect(DescribeSchema.safeParse({ ...reply, category: "brunch" }).success).toBe(false);
    expect(DescribeSchema.safeParse(NO_PLATE).success).toBe(false);
  });
});

describe("tidyDescribe", () => {
  it("keeps 12 foods, clamps grams to whole numbers from 1 to 2,000, and nulls an id the table lacks", () => {
    const items = Array.from({ length: 13 }, (_, i) => ({ label: `Food ${i}`, foodId: "white-rice-cooked", grams: 100 }));
    items[0] = { label: "  Rice  ", foodId: "white-rice-cooked", grams: 2500 };
    items[1] = { label: "Crumb", foodId: "black-beans-cooked", grams: 0.4 };
    items[2] = { label: "Coconut aminos", foodId: "coconut-aminos", grams: 15.6 };
    const tidy = tidyDescribe({ name: ` ${"Big lunch ".repeat(8)}`, category: "meal", items }, known);
    expect(tidy.name).toBe("Big lunch ".repeat(6).trim());
    expect(tidy.items).toHaveLength(12);
    expect(tidy.items.slice(0, 3)).toEqual([
      { label: "Rice", foodId: "white-rice-cooked", grams: 2000 },
      { label: "Crumb", foodId: "black-beans-cooked", grams: 1 },
      { label: "Coconut aminos", foodId: null, grams: 16 },
    ]);
  });

  it("names a nameless plate", () => {
    expect(tidyDescribe({ name: "  ", category: "snack", items: [] }, known)).toEqual({ name: "Something else", category: "snack", items: [] });
  });
});
