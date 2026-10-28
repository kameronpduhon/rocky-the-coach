import { describe, expect, it } from "vitest";
import { buildLibrary } from "~/library/model";
import type { Row } from "~/sync/tables";

const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-05:00`);
const rowsOf = (t: Record<string, Row[]>) => (name: string) => t[name] ?? [];
const WED = at("2026-10-28", "09:00");
const rows = rowsOf({
  targets: [{ effective_from: "2026-10-26", kcal: 2300, protein_g: 180, step_goal: 8500 }],
  meal_state: [
    { slug: "greek-yogurt-power-bowl", rested_until: "2026-11-08", photo_key: null },
    // Rested until a day already past.
    { slug: "salmon-and-rice", rested_until: "2026-10-20", photo_key: null },
  ],
  usual_orders: [
    { client_id: "u2", name: "Ranch Water", category: "drink", kcal: 100, protein_g: 0, relaxed: 0, uses: 1, last_used_at: "2026-10-24T18:00:00Z" },
    { client_id: "u1", name: "Chipotle bowl, double chicken", category: "restaurant", kcal: 1050, protein_g: 75, relaxed: 1, uses: 3, last_used_at: "2026-10-20T18:00:00Z" },
  ],
  workout_sessions: [{ id: null, client_id: "m", date: "2026-10-26", template_id: "mon-chest-back-arms", started_at: "2026-10-26T17:00:00Z", ended_at: "2026-10-26T18:00:00Z", lifts: null, feel: null }],
  set_logs: [{ id: null, client_id: "s1", session_key: "m", exercise_id: "incline-dumbbell-press", position: 0, set_number: 1, weight_lb: 55, reps: 9, logged_at: "2026-10-26T17:01:00Z" }],
});

describe("buildLibrary", () => {
  const m = buildLibrary(rows, WED, true);

  it("counts the meals and exercises", () => {
    expect([m.mealCount, m.exerciseCount]).toEqual([25, 49]);
  });

  it("lists meals by section, alphabetically, at today's grams", () => {
    expect(m.meals.map((s) => [s.label, s.rows.length, s.open, s.limit])).toEqual([
      ["Breakfast", 4, true, null],
      ["Lunch and dinner", 8, true, 3],
      ["Snacks", 5, false, null],
      ["Desserts", 5, false, null],
      ["Weekend only", 3, false, null],
    ]);
    // At 2,300, as the meal screen shows them.
    expect(m.meals[0].rows.map((r) => [r.name, r.sub, r.resting])).toEqual([
      ["Banana protein pancakes", "570 cal · 60 g", null],
      ["Greek yogurt power bowl", "535 cal · 62 g", "RESTING TO NOV 8"],
      ["Loaded egg and potato hash", "610 cal · 56 g", null],
      ["Steak and eggs", "525 cal · 58 g", null],
    ]);
    expect(m.meals[1].rows.slice(0, 3).map((r) => [r.name, r.sub])).toEqual([
      ["Burger bowl", "625 cal · 50 g · ground beef, once a week"],
      ["Chicken and rice bowl", "605 cal · 55 g"],
      ["Garlic butter shrimp and rice", "595 cal · 56 g"],
    ]);
    expect(m.meals[1].rows.find((r) => r.slug === "salmon-and-rice")!.resting).toBeNull();
    expect(m.meals[0].rows[0].to).toBe("/meal/banana-protein-pancakes?from=library");
  });

  it("lists the usual orders as the off-plan sheet does", () => {
    expect(m.usuals).toEqual([
      { key: "u1", name: "Chipotle bowl, double chicken", sub: "1,050 cal · 75 g · relaxed" },
      { key: "u2", name: "Ranch Water", sub: "100 cal · drink" },
    ]);
  });

  it("splits each body part into the plan's lifts and its swaps, Chest open", () => {
    expect(m.exercises.map((s) => [s.label, s.note, s.open, s.rows.length, s.swaps.length])).toEqual([
      ["Chest", "4 in plan · 8 swaps", true, 4, 8],
      ["Back", "3 in plan · 3 swaps", false, 3, 3],
      ["Shoulders", "4 in plan · 5 swaps", false, 4, 5],
      ["Arms", "6 in plan · 8 swaps", false, 6, 8],
      ["Legs", "4 in plan · 4 swaps", false, 4, 4],
    ]);
    expect(m.exercises[0].rows.map((r) => [r.name, r.sub, r.best])).toEqual([
      ["Cable fly, low to high", "Cable · Friday", null],
      ["Flat dumbbell press", "Dumbbells · Friday", null],
      ["Incline dumbbell press", "Dumbbells · Monday", "55 × 9"],
      ["Pec deck", "Machine · Monday", null],
    ]);
    expect(m.exercises[0].rows[2]).toMatchObject({ image: "/media/exercises/Incline_Dumbbell_Press/0.jpg", to: "/lift/incline-dumbbell-press?from=library" });
    expect(m.exercises[0].swapsLine).toBe(
      "Swaps: barbell bench press, cable crossover, dumbbell fly, machine chest press, machine incline press, push-ups, smith machine bench press, smith machine incline press",
    );
    expect(m.exercises[1].rows.find((r) => r.id === "pull-up")!.sub).toBe("Body weight · The extra");
    expect(m.exercises[2].rows.find((r) => r.id === "cable-lateral-raise")!.sub).toBe("Cable · Wednesday and the extra");
  });

  it("searches by name, opening every section with a match", () => {
    const curl = buildLibrary(rows, WED, true, "  CURL ");
    expect(curl.meals).toEqual([]);
    expect(curl.exercises.map((s) => [s.label, s.open, s.swapsOpen, s.rows.map((r) => r.name), s.swaps.map((r) => r.name)])).toEqual([
      ["Arms", true, true, ["Hammer curl", "Incline dumbbell curl", "Preacher curl"], ["Alternating dumbbell curl", "Cable rope hammer curl", "Dumbbell curl", "Machine preacher curl"]],
      ["Legs", true, true, ["Lying leg curl"], ["Seated leg curl"]],
    ]);
    const steak = buildLibrary(rows, WED, true, "steak");
    expect(steak.meals.map((s) => [s.id, s.open, s.limit, s.rows.map((r) => r.name)])).toEqual([
      ["breakfast", true, null, ["Steak and eggs"]],
      ["main", true, null, ["Steak and baked potato", "Steak and egg rice bowl"]],
      ["weekend", true, null, ["Steak salad"]],
    ]);
    expect(steak.usuals).toEqual([]);
  });

  it("without a plan: recipe grams, no meal links, and plain exercise lists", () => {
    const c = buildLibrary(rowsOf({}), WED, false);
    expect(c.meals[0].rows[0]).toEqual({ slug: "banana-protein-pancakes", name: "Banana protein pancakes", sub: "575 cal · 60 g", resting: null, to: null });
    expect(c.exercises.map((s) => [s.label, s.note, s.rows.length, s.swaps.length, s.swapsLine])).toEqual([
      ["Chest", "12", 12, 0, null],
      ["Back", "6", 6, 0, null],
      ["Shoulders", "9", 9, 0, null],
      ["Arms", "14", 14, 0, null],
      ["Legs", "8", 8, 0, null],
    ]);
    expect(c.exercises[0].rows[0].sub).toBe("Barbell");
  });
});
