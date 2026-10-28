// "Ate something else" after its usual orders: the choice rows and the product card (options 1C and 3B).
import type { Product } from "~/ai/barcode";
import { labelSane, type LabelRead } from "~/ai/label";
import type { DescribeReply } from "~/ai/describe";
import { COACH_NAME } from "~/brand";

export interface Choice {
  kind: "describe" | "scan";
  label: string;
  sub: string;
  disabled: boolean;
}

/**
 * The sheet's title for each view but the plate, which shows the meal's name. Behind a back button the title is the
 * view's own short name: the scan, its product card and its not-found all read "Scan", as the options board draws it.
 */
export const SHEET_TITLE = { usuals: "Ate something else", form: "Something new", scan: "Scan", card: "Scan", describe: "Describe it" } as const;

/** The rows under "Not in your usuals?". `aiReady`: the person's switch is on and the server has a key. */
export function offPlanChoices({ aiReady, online }: { aiReady: boolean; online: boolean }): Choice[] {
  const scanLabel = aiReady ? "Scan" : "Scan a barcode";
  if (!online) {
    const scan: Choice = { kind: "scan", label: scanLabel, sub: "Needs a signal", disabled: true };
    return aiReady ? [{ kind: "describe", label: "Describe it", sub: "Needs a signal", disabled: true }, scan] : [scan];
  }
  const scan: Choice = { kind: "scan", label: scanLabel, sub: aiReady ? "Barcode or label" : "Looks it up in Open Food Facts", disabled: false };
  return aiReady ? [{ kind: "describe", label: "Describe it", sub: "Type it like a text", disabled: false }, scan] : [scan];
}

/** Why Describe it has no plate to show, or null when it has one. */
export function describeProblem(reply: DescribeReply | null): string | null {
  if (!reply) return `${COACH_NAME} couldn't build that plate just now. Try again, or type the numbers.`;
  if (reply.items.length === 0) return `${COACH_NAME} couldn't find any foods in that. Try naming each one.`;
  return null;
}

/** What the product card shows, from a barcode or a label. Numbers are per serving, or per 100 g with no serving. */
export interface CardSource {
  /** Null from a label with no printed name: the card asks for one. */
  name: string | null;
  servingText: string | null;
  kcal: number;
  proteinG: number;
  from: "barcode" | "label";
  drink: boolean;
}

/** The Something new form's starting values. */
export interface FormValues {
  name: string;
  category: "meal" | "snack" | "dessert" | "drink";
  kcal: number;
  protein: number;
}

export function cardFromProduct(p: Product): CardSource {
  return { name: p.name, servingText: p.servingText, kcal: p.kcal, proteinG: p.proteinG, from: "barcode", drink: p.drink };
}

export function sourceLine(c: CardSource): string {
  return `Per ${c.servingText ?? "100 g"} · ${c.from === "barcode" ? "Open Food Facts" : "From the label"}`;
}

export interface CardStepper {
  label: "Servings" | "Grams";
  start: number;
  min: number;
  max: number;
  step: number;
  /** After the number on the stepper: "" for servings, " g" for grams. */
  unit: string;
}

export function stepperFor(c: CardSource): CardStepper {
  return c.servingText === null ? { label: "Grams", start: 100, min: 10, max: 1000, step: 10, unit: " g" } : { label: "Servings", start: 1, min: 1, max: 10, step: 1, unit: "" };
}

const NAME_MAX = 80;

function totals(c: CardSource, count: number): { kcal: number; protein: number } {
  const times = c.servingText === null ? count / 100 : count;
  return { kcal: Math.round(c.kcal * times), protein: Math.round(c.proteinG * times) };
}

const categoryOf = (c: CardSource): FormValues["category"] => (c.from === "barcode" && c.drink ? "drink" : "snack");

/** What Log it sends to `logOffPlan`, less the ids, date, relaxed (off) and Save as a usual. */
export function cardLog(c: CardSource, count: number, name: string): { name: string; category: FormValues["category"]; kcal: number; proteinG: number } {
  const suffix = c.servingText === null ? `, ${count} g` : count > 1 ? `, ${count} servings` : "";
  const t = totals(c, count);
  return { name: `${name.trim().slice(0, NAME_MAX - suffix.length)}${suffix}`, category: categoryOf(c), kcal: t.kcal, proteinG: t.protein };
}

/** "Numbers look wrong? Edit them": the form, filled with the plain name and the numbers for the count shown. */
export function cardEdit(c: CardSource, count: number, name: string): FormValues {
  const t = totals(c, count);
  return { name: name.trim().slice(0, NAME_MAX), category: categoryOf(c), kcal: t.kcal, protein: t.protein };
}

export type LabelOutcome = { kind: "card"; card: CardSource } | { kind: "form"; values: FormValues; note: string } | { kind: "unreadable" };

/** Where a label read lands: the card, the form with a warning, or "Couldn't read that label." */
export function labelOutcome(read: LabelRead | null): LabelOutcome {
  if (!read || !read.readable || read.kcal === null) return { kind: "unreadable" };
  const proteinG = read.proteinG ?? 0;
  if (!labelSane(read.kcal, proteinG)) {
    return { kind: "form", values: { name: read.name ?? "", category: "snack", kcal: Math.round(read.kcal), protein: Math.round(proteinG) }, note: "These numbers look off. Check them against the label." };
  }
  return { kind: "card", card: { name: read.name, servingText: read.servingText ?? "1 serving", kcal: read.kcal, proteinG, from: "label", drink: false } };
}
