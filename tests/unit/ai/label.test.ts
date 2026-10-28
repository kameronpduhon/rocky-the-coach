import { describe, expect, it } from "vitest";
import { LabelSchema, labelSane, UNREADABLE } from "~/ai/label";

describe("LabelSchema", () => {
  it("takes what a label prints, with nulls for what it doesn't", () => {
    const read = { readable: true, name: null, servingText: "1 bar (55 g)", servingGrams: 55, kcal: 200, proteinG: 20 };
    expect(LabelSchema.parse(read)).toEqual(read);
    expect(LabelSchema.parse(UNREADABLE)).toEqual({ readable: false, name: null, servingText: null, servingGrams: null, kcal: null, proteinG: null });
  });

  it("refuses numbers no label prints", () => {
    expect(LabelSchema.safeParse({ ...UNREADABLE, readable: true, kcal: 6000 }).success).toBe(false);
    expect(LabelSchema.safeParse({ ...UNREADABLE, readable: true, kcal: 200, proteinG: -1 }).success).toBe(false);
    expect(LabelSchema.safeParse({ readable: true }).success).toBe(false);
  });
});

describe("labelSane", () => {
  it("passes a protein bar's label", () => {
    expect(labelSane(200, 20)).toBe(true);
    expect(labelSane(0, 0)).toBe(true);
  });

  it("allows protein × 4 up to calories + 20, and no further", () => {
    expect(labelSane(100, 30)).toBe(true);
    expect(labelSane(100, 30.5)).toBe(false);
  });

  it("fails protein too high for the calories, calories past 2,000, protein past 200", () => {
    expect(labelSane(250, 70)).toBe(false);
    expect(labelSane(2100, 10)).toBe(false);
    expect(labelSane(1900, 210)).toBe(false);
    expect(labelSane(-5, 0)).toBe(false);
  });
});
