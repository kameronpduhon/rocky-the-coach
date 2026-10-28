import { describe, expect, it } from "vitest";
import { meals } from "~/content";
import { factorFor, scaledMeal } from "~/content/scaled";
import { batchMeta, buildMeal, mainProtein, scaleRows } from "~/meal/model";
import type { Row } from "~/sync/tables";

const WED = "2026-10-28";
const THU = "2026-10-29";
const FRI = "2026-10-30";
const BOWL = "chicken-and-rice-bowl";
const STEAK = "steak-and-baked-potato";
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-05:00`);
const rowsOf = (t: Record<string, Row[]>) => (name: string) => t[name] ?? [];
const DAY = { breakfast: "steak-and-eggs", lunch: BOWL, snack: "greek-yogurt-and-berries", dinner: "honey-glazed-chicken-thighs", dessert: "protein-ice-cream" };
const planned = (date: string): Row[] => Object.entries(DAY).map(([slot, meal_slug]) => ({ date, slot, meal_slug, swapped: 0 }));
// Sunday's check-in trimmed 100 cal a day from Monday Oct 26.
const trimmed: Row[] = [{ effective_from: "2026-10-26", kcal: 2300, protein_g: 180, step_goal: 8500 }];
const log = (slot: keyof typeof DAY, category: "planned" | "skipped", client_id: string, logged_at: string): Row => ({
  id: null, client_id, date: WED, slot, meal_slug: category === "planned" ? DAY[slot] : null, name: "x", category, kcal: category === "planned" ? 600 : 0, protein_g: 0, relaxed: 0, portions: 1, logged_at,
});
const batch = (o: Row): Row => ({ id: null, client_id: "b-1", meal_slug: BOWL, portions: 3, cooked_weight_g: 495, portion_g: 165, created_on: WED, portions_left: 3, factor: 1, ...o });
const lunch = (rows: Record<string, Row[]>, hhmm = "13:00", date = WED) => buildMeal(rowsOf(rows), at(date, hhmm), { slug: BOWL, slot: "lunch" })!;

describe("buildMeal", () => {
  it("opens today's lunch at the trimmed grams, with what rice and butter weighed before", () => {
    const m = lunch({ planned_meals: planned(WED), targets: trimmed });
    expect(m).toMatchObject({ mode: "today", slot: "lunch", state: "open", canCook: true, meta: "Lunch · 2:00 · 605 cal · 55 g protein" });
    expect(m.meal).toEqual(scaledMeal(meals.get(BOWL)!, factorFor(2300)));
    expect(scaleRows(m, 1).map((r) => [r.name, r.sub, r.grams, r.was])).toEqual([
      ["Chicken breast", "Raw", 220, null],
      ["White rice", "Cooked", 175, "Was 200."],
      ["Butter", null, 9, "Was 10."],
      ["Pineapple", "On the side", 100, null],
    ]);
    expect(m.wasNote).toBe("Sunday's check-in trimmed 100 cal a day, so rice and butter took the cut.");
  });

  it("weighs the whole batch, with a portion's worth in each subline", () => {
    const m = lunch({ planned_meals: planned(WED), targets: trimmed });
    expect(batchMeta(m, 3)).toBe("Lunch for Wed, Thu, Fri · 605 cal each");
    expect(scaleRows(m, 3).map((r) => [r.sub, r.grams, r.was])).toEqual([
      ["Raw, 220 g a portion", 660, null],
      ["Cooked, 175 g a portion", 525, "Was 600."],
      ["9 g a portion", 25, "Was 30."],
      ["100 g a portion, on the side", 300, null],
    ]);
  });

  it("shows when it was eaten, or that it was skipped, with the key Undo removes", () => {
    const eaten = lunch({ planned_meals: planned(WED), meal_logs: [log("lunch", "planned", "m-1", "2026-10-28T19:04:00Z")] }, "14:30");
    expect(eaten).toMatchObject({ state: "eaten", eatenAt: "2:04pm", logKey: "m-1", canCook: false, swaps: [] });
    const skipped = lunch({ planned_meals: planned(WED), meal_logs: [log("lunch", "skipped", "s-1", "2026-10-28T19:04:00Z")] }, "14:30");
    expect(skipped).toMatchObject({ state: "skipped", eatenAt: null, logKey: "s-1", canCook: false });
  });

  it("offers swaps that fit the slot and the day, best fit first, flagging the ones short on protein", () => {
    const m = lunch({ planned_meals: planned(WED), targets: trimmed });
    expect(m.swaps[0]).toMatchObject({ slug: "lemon-butter-cod-and-potatoes", kcal: 545, protein: 59, best: true, lowProtein: false });
    expect(m.swaps.find((o) => o.slug === "salmon-and-rice")).toMatchObject({ kcal: 585, protein: 44, best: false, lowProtein: true });
    expect(m.swaps.map((o) => o.slug)).not.toContain(BOWL);
    // Weekends only.
    expect(m.swaps.map((o) => o.slug)).not.toContain("chicken-fajita-bowl");
  });

  it("opens a meal on today's plan as its slot, even without one in the link", () => {
    const m = buildMeal(rowsOf({ planned_meals: planned(WED) }), at(WED, "13:00"), { slug: "honey-glazed-chicken-thighs", slot: null })!;
    expect(m).toMatchObject({ mode: "today", slot: "dinner" });
  });

  it("browses any other meal, offering the pool's slot that is still current", () => {
    const browse = (hhmm: string, meal_logs: Row[] = []) => buildMeal(rowsOf({ planned_meals: planned(WED), targets: trimmed, meal_logs }), at(WED, hhmm), { slug: STEAK, slot: null })!;
    const noon = browse("13:00");
    expect(noon).toMatchObject({ mode: "browse", slot: null, meta: "Lunch or dinner · 590 cal · 60 g protein", swaps: [], canCook: false, wasNote: null });
    expect(noon.haveIt).toEqual({ slot: "lunch", label: "Have it for lunch today", then: "Replaces chicken and rice bowl, just today." });
    expect(scaleRows(noon, 1).find((r) => r.name === "Russet potatoes")).toMatchObject({ sub: "Raw, was 300", grams: 260, was: null });
    // Lunch's window closed at the 3:30 snack, so dinner is current until dessert at 8:00.
    expect(browse("17:00").haveIt).toEqual({ slot: "dinner", label: "Have it for dinner tonight", then: "Replaces honey-glazed chicken thighs, just today." });
    expect(browse("21:00", [log("lunch", "planned", "m-1", "2026-10-28T19:04:00Z"), log("dinner", "skipped", "s-1", "2026-10-29T01:00:00Z")]).haveIt).toBeNull();
  });

  it("offers nothing for a resting meal or one that doesn't fit the day", () => {
    const resting = buildMeal(rowsOf({ planned_meals: planned(WED), meal_state: [{ slug: STEAK, photo_key: null, rested_until: "2026-11-24" }] }), at(WED, "13:00"), { slug: STEAK, slot: null })!;
    expect(resting).toMatchObject({ mode: "browse", restingUntil: "Nov 24", haveIt: null });
    expect(buildMeal(rowsOf({ planned_meals: planned(WED) }), at(WED, "13:00"), { slug: "chicken-fajita-bowl", slot: null })!.haveIt).toBeNull();
  });

  it("after a batch is saved, gives each portion and the days it planned", () => {
    const m = lunch({ planned_meals: [...planned(WED), ...planned(THU), ...planned(FRI)], batches: [batch({})] });
    expect(m).toMatchObject({ canCook: false, leftover: null, todayBatch: { portions: 3, portionG: 165, laterDays: ["Thursday", "Friday"] } });
  });

  it("the next day, weighs the cooked protein from the batch, at the grams the batch was cooked at", () => {
    const m = lunch({ planned_meals: planned(THU), targets: trimmed, batches: [batch({ portions_left: 2 })] }, "13:00", THU);
    expect(m.meal).toEqual(meals.get(BOWL));
    expect(m).toMatchObject({
      canCook: false,
      todayBatch: null,
      wasNote: null,
      meta: "Thursday lunch · portion 2 of 3 from Wednesday's batch",
      leftover: { portion: 2, portions: 3, cookedOn: "Wednesday", closing: "One portion left for Friday." },
    });
    expect(scaleRows(m, 1)[0]).toEqual({ food: "chicken-breast-raw", name: "Chicken breast, from the batch", sub: "Cooked, a third of 495 g", grams: 165, was: null, highlight: true });
    const last = lunch({ planned_meals: planned(FRI), batches: [batch({ portions_left: 1 })] }, "13:00", FRI);
    expect(last.leftover).toMatchObject({ portion: 3, closing: "Last portion." });
  });

  it("offers a batch only when the main protein is weighed raw, since the batch weighs it cooked", () => {
    const at7 = (slug: string, slot: "breakfast" | "dessert", hhmm: string) => buildMeal(rowsOf({ planned_meals: planned(WED) }), at(WED, hhmm), { slug, slot })!;
    expect(at7("steak-and-eggs", "breakfast", "07:00").canCook).toBe(true);
    expect(at7("protein-ice-cream", "dessert", "19:30")).toMatchObject({ state: "open", canCook: false });
  });

  it("counts eggs, scoops and fruit from the grams, so the meal's note never repeats it", () => {
    const eggs = buildMeal(rowsOf({ planned_meals: planned(WED) }), at(WED, "07:00"), { slug: "steak-and-eggs", slot: "breakfast" })!;
    expect(scaleRows(eggs, 1).map((r) => [r.name, r.sub])).toEqual([
      ["Top sirloin, trimmed", "Raw"],
      ["Eggs", "Raw, 2 eggs"],
      ["Egg whites", "Raw"],
      ["Butter", null],
      ["Bananas", "1 banana, on the side"],
    ]);
    expect(scaleRows(eggs, 3)[1].sub).toBe("Raw, 100 g a portion, 6 eggs");
    const bowl = buildMeal(rowsOf({}), at(WED, "07:00"), { slug: "greek-yogurt-power-bowl", slot: null })!;
    expect(scaleRows(bowl, 1).find((r) => r.name === "Bananas")?.sub).toBe("About 1 banana");
  });

  it("knows no meal it doesn't have, and finds each meal's main protein", () => {
    expect(buildMeal(rowsOf({}), at(WED, "13:00"), { slug: "nope", slot: null })).toBeNull();
    expect(mainProtein(meals.get(BOWL)!).food).toBe("chicken-breast-raw");
    expect(mainProtein(meals.get("egg-and-potato-hash")!).food).toBe("egg-white");
  });
});
