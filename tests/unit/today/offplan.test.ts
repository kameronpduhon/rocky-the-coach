import { describe, expect, it } from "vitest";
import { cardEdit, cardFromProduct, cardLog, describeProblem, labelOutcome, offPlanChoices, sourceLine, stepperFor, type CardSource } from "~/today/offplan";

const SHAKE: CardSource = { name: "fa!rlife CORE POWER HIGH PROTEIN MILK SHAKE", servingText: "1 bottle (414 g)", kcal: 170, proteinG: 26, from: "barcode", drink: true };
const NUTELLA: CardSource = { name: "Nutella", servingText: null, kcal: 539, proteinG: 6.3, from: "barcode", drink: false };
const BAR: CardSource = { name: "Barebells protein bar, cookies and cream", servingText: "1 bar (55 g)", kcal: 200, proteinG: 20, from: "label", drink: false };

describe("offPlanChoices", () => {
  const describeIt = { kind: "describe", label: "Describe it", sub: "Type it like a text", disabled: false };

  it("offers Describe it and Scan with the AI on and a signal", () => {
    expect(offPlanChoices({ aiReady: true, online: true })).toEqual([describeIt, { kind: "scan", label: "Scan", sub: "Barcode or label", disabled: false }]);
  });

  it("hides Describe it and offers a barcode only with the AI off or no key", () => {
    expect(offPlanChoices({ aiReady: false, online: true })).toEqual([{ kind: "scan", label: "Scan a barcode", sub: "Looks it up in Open Food Facts", disabled: false }]);
  });

  it("needs a signal for both", () => {
    expect(offPlanChoices({ aiReady: true, online: false })).toEqual([
      { kind: "describe", label: "Describe it", sub: "Needs a signal", disabled: true },
      { kind: "scan", label: "Scan", sub: "Needs a signal", disabled: true },
    ]);
    expect(offPlanChoices({ aiReady: false, online: false })).toEqual([{ kind: "scan", label: "Scan a barcode", sub: "Needs a signal", disabled: true }]);
  });
});

describe("describeProblem", () => {
  it("says why there is no plate, or nothing when there is one", () => {
    expect(describeProblem(null)).toBe("Rocky couldn't build that plate just now. Try again, or type the numbers.");
    expect(describeProblem({ name: "Lunch", category: "meal", items: [] })).toBe("Rocky couldn't find any foods in that. Try naming each one.");
    expect(describeProblem({ name: "Lunch", category: "meal", items: [{ label: "Rice", foodId: "white-rice-cooked", grams: 150 }] })).toBeNull();
  });
});

describe("the product card", () => {
  it("comes from a product as Open Food Facts gave it", () => {
    expect(cardFromProduct({ code: "0811620021982", name: SHAKE.name!, servingText: "1 bottle (414 g)", kcal: 170, proteinG: 26, drink: true })).toEqual(SHAKE);
  });

  it("names its source", () => {
    expect(sourceLine(SHAKE)).toBe("Per 1 bottle (414 g) · Open Food Facts");
    expect(sourceLine(NUTELLA)).toBe("Per 100 g · Open Food Facts");
    expect(sourceLine(BAR)).toBe("Per 1 bar (55 g) · From the label");
  });

  it("steps servings 1 to 10, or grams from 100 when there is no serving", () => {
    expect(stepperFor(SHAKE)).toEqual({ label: "Servings", start: 1, min: 1, max: 10, step: 1, unit: "" });
    expect(stepperFor(NUTELLA)).toEqual({ label: "Grams", start: 100, min: 10, max: 1000, step: 10, unit: " g" });
  });

  it("logs one serving as it is, and more with the count in the name", () => {
    expect(cardLog(SHAKE, 1, SHAKE.name!)).toEqual({ name: "fa!rlife CORE POWER HIGH PROTEIN MILK SHAKE", category: "drink", kcal: 170, proteinG: 26 });
    expect(cardLog(SHAKE, 2, SHAKE.name!)).toEqual({ name: "fa!rlife CORE POWER HIGH PROTEIN MILK SHAKE, 2 servings", category: "drink", kcal: 340, proteinG: 52 });
  });

  it("logs grams of a per-100 g product", () => {
    expect(cardLog(NUTELLA, 40, "Nutella")).toEqual({ name: "Nutella, 40 g", category: "snack", kcal: 216, proteinG: 3 });
  });

  it("files a label read as a snack and keeps the name under 80 with its suffix", () => {
    expect(cardLog(BAR, 3, BAR.name!)).toEqual({ name: "Barebells protein bar, cookies and cream, 3 servings", category: "snack", kcal: 600, proteinG: 60 });
    expect(cardLog(BAR, 2, "x".repeat(80)).name).toBe(`${"x".repeat(68)}, 2 servings`);
  });

  it("fills the form with the plain name and the numbers for the servings shown", () => {
    expect(cardEdit(SHAKE, 2, SHAKE.name!)).toEqual({ name: SHAKE.name, category: "drink", kcal: 340, protein: 52 });
  });
});

describe("labelOutcome", () => {
  const read = { readable: true, name: "Barebells protein bar, cookies and cream", servingText: "1 bar (55 g)", servingGrams: 55, kcal: 200, proteinG: 20 };

  it("shows a sane read on the card", () => {
    expect(labelOutcome(read)).toEqual({ kind: "card", card: BAR });
  });

  it("asks for a name on the card when the label printed none", () => {
    expect(labelOutcome({ ...read, name: null })).toEqual({ kind: "card", card: { ...BAR, name: null } });
  });

  it("reads a missing serving as one serving and missing protein as 0", () => {
    expect(labelOutcome({ ...read, servingText: null, proteinG: null })).toEqual({ kind: "card", card: { ...BAR, servingText: "1 serving", proteinG: 0 } });
  });

  it("opens the form filled in when the numbers look off", () => {
    expect(labelOutcome({ ...read, kcal: 250, proteinG: 70 })).toEqual({
      kind: "form",
      values: { name: "Barebells protein bar, cookies and cream", category: "snack", kcal: 250, protein: 70 },
      note: "These numbers look off. Check them against the label.",
    });
  });

  it("is unreadable for a fallback, no panel, or no calories", () => {
    expect(labelOutcome(null)).toEqual({ kind: "unreadable" });
    expect(labelOutcome({ ...read, readable: false })).toEqual({ kind: "unreadable" });
    expect(labelOutcome({ ...read, kcal: null })).toEqual({ kind: "unreadable" });
  });
});
