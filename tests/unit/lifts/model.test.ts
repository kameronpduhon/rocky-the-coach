import { describe, expect, it } from "vitest";
import { bestSets, buildLift, buildLifts, liftIds, planLifts } from "~/lifts/model";
import type { Row } from "~/sync/tables";

const rowsOf = (t: Record<string, Row[]>) => (name: string) => t[name] ?? [];
const WED = "2026-10-28";
const MONDAYS = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"];
const TUESDAYS = ["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27"];
const done = (client_id: string, date: string, template_id: string): Row => ({
  id: null, client_id, date, template_id, started_at: `${date}T17:00:00Z`, ended_at: `${date}T18:00:00Z`, lifts: null, feel: null,
});
let n = 0;
const sets = (key: string, date: string, exercise_id: string, list: [number, number][]): Row[] =>
  list.map(([weight_lb, reps], i) => ({ id: null, client_id: `s-${++n}`, session_key: key, exercise_id, position: 0, set_number: i + 1, weight_lb, reps, logged_at: `${date}T17:0${i}:00Z` }));
const PEC: [number, number][][] = [[[120, 12], [120, 11]], [[125, 11], [125, 10]], [[125, 12], [125, 11]], [[130, 12], [130, 12]]];
// Incline press is 6 to 10, so Oct 5 and Oct 19 hit the top.
const INCLINE: [number, number][][] = [[[45, 10], [45, 10]], [[50, 9], [50, 8]], [[50, 10], [50, 10]], [[55, 9], [55, 8]]];
const PULL_UPS: [number, number][][] = [[[0, 6], [0, 5]], [[0, 7], [0, 6]], [[0, 7], [0, 7]], [[0, 8], [0, 7]]];
const history = {
  workout_sessions: [
    ...MONDAYS.map((d, i) => done(`mon-${i}`, d, "mon-chest-back-arms")),
    ...TUESDAYS.map((d, i) => done(`tue-${i}`, d, "optional-arms-back")),
    // Before the phase: left out.
    done("old", "2026-09-28", "mon-chest-back-arms"),
  ],
  set_logs: [
    ...MONDAYS.flatMap((d, i) => [...sets(`mon-${i}`, d, "incline-dumbbell-press", INCLINE[i]), ...sets(`mon-${i}`, d, "pec-deck", PEC[i])]),
    ...TUESDAYS.flatMap((d, i) => sets(`tue-${i}`, d, "pull-up", PULL_UPS[i])),
    // A lift outside the plan, added to Tuesday's extra once.
    ...sets("tue-3", TUESDAYS[3], "cable-crossover", [[30, 12], [30, 11]]),
    ...sets("old", "2026-09-28", "pec-deck", [[200, 12]]),
  ],
};
const rows = rowsOf(history);

describe("planLifts", () => {
  it("holds the 21 lifts of the gym and extra workouts, with cable lateral raise in two", () => {
    const lifts = planLifts(rowsOf({}));
    expect(lifts.size).toBe(21);
    expect(lifts.get("cable-lateral-raise")).toEqual({ templates: ["wed-legs-shoulders", "optional-arms-back"], repMin: 10, repMax: 15 });
  });

  it("follows an always-swap", () => {
    const swapped = planLifts(rowsOf({ exercise_overrides: [{ template_id: "mon-chest-back-arms", position: 1, exercise_id: "cable-crossover" }] }));
    expect(swapped.has("pec-deck")).toBe(false);
    expect(swapped.get("cable-crossover")).toEqual({ templates: ["mon-chest-back-arms"], repMin: 8, repMax: 12 });
  });
});

describe("buildLifts", () => {
  it("counts the plan's lifts plus anything else logged, grouped by body part", () => {
    expect(liftIds(rows)).toHaveLength(22);
    const m = buildLifts(rows);
    expect(m.title).toBe("All 22 lifts.");
    expect(m.meta).toBe("Best set, and gain since Oct 5");
    expect(m.sections.map((s) => [s.label, s.rows.length])).toEqual([
      ["Chest", 5],
      ["Back", 3],
      ["Shoulders", 4],
      ["Arms", 6],
      ["Legs", 4],
    ]);
    expect(m.sections[0].rows.map((r) => [r.name, r.sub, r.spark, r.gain])).toEqual([
      ["Incline dumbbell press", "Best 55 × 9 · Mon", [45, 50, 50, 55], "+10"],
      ["Pec deck", "Best 130 × 12 · Mon", [120, 125, 125, 130], "+10"],
      ["Flat dumbbell press", "No sets yet · Fri", [], "0"],
      ["Cable fly, low to high", "No sets yet · Fri", [], "0"],
      ["Cable crossover", "Best 30 × 12 · Swap", [30], "0"],
    ]);
    // Body weight counts reps.
    expect(m.sections[1].rows[2]).toMatchObject({ name: "Pull-ups", sub: "Best 8 reps · Extra", spark: [6, 7, 7, 8], gain: "+2" });
  });

  it("is the plan's 21 when nothing else was logged", () => {
    expect(buildLifts(rowsOf({})).title).toBe("All 21 lifts.");
  });
});

describe("buildLift", () => {
  it("shows the best set, the gain, the history and the swaps, and goes up next time", () => {
    const p = buildLift(rows, WED, "pec-deck", "progress", true)!;
    expect(p).toMatchObject({
      header: "ALL LIFTS · CHEST",
      back: { to: "/progress/lifts", label: "Back to all lifts" },
      title: "Pec deck.",
      meta: "Machine · Monday · 8 to 12 reps",
      images: ["/media/exercises/Butterfly/0.jpg", "/media/exercises/Butterfly/1.jpg"],
      best: { text: "130 × 12", unit: "lb", goUp: true, change: "up 10 lb since Oct 5" },
      swapsNote: "8 for chest",
    });
    expect(p.chart.map((c) => c.value)).toEqual([120, 125, 125, 130]);
    expect(p.history.map((h) => [h.label, h.sets, h.next, h.goUp])).toEqual([
      ["OCT 26", "130 × 12, 12", "next 135", false],
      ["OCT 19", "125 × 12, 11", null, false],
      ["OCT 12", "125 × 11, 10", null, false],
      ["OCT 5", "120 × 12, 11", null, false],
    ]);
    expect(p.history[0].to).toBe("/workout?date=2026-10-26&back=%2Flift%2Fpec-deck%3Ffrom%3Dprogress");
    expect(p.swaps.map((s) => s.name)).toEqual([
      "Barbell bench press",
      "Cable crossover",
      "Dumbbell fly",
      "Machine chest press",
      "Machine incline press",
      "Push-ups",
      "Smith machine bench press",
      "Smith machine incline press",
    ]);
    expect(p.swaps[1]).toEqual({ id: "cable-crossover", name: "Cable crossover", equipment: "Cable", to: "/lift/cable-crossover?from=progress" });
  });

  it("tags the older sessions that earned a move", () => {
    const p = buildLift(rows, WED, "incline-dumbbell-press", "library", true)!;
    expect(p.header).toBe("LIBRARY · CHEST");
    expect(p.back).toEqual({ to: "/library?tab=exercises", label: "Back to Library" });
    expect(p.meta).toBe("Dumbbells · Monday · 6 to 10 reps");
    expect(p.best).toEqual({ text: "55 × 9", unit: "lb", goUp: false, change: "up 10 lb since Oct 5" });
    expect(p.history.map((h) => [h.label, h.sets, h.next, h.goUp])).toEqual([
      ["OCT 26", "55 × 9, 8", null, false],
      ["OCT 19", "50 × 10, 10", null, true],
      ["OCT 12", "50 × 9, 8", null, false],
      ["OCT 5", "45 × 10, 10", null, true],
    ]);
  });

  it("counts reps for a body-weight lift", () => {
    const p = buildLift(rows, WED, "pull-up", "library", true)!;
    expect(p.meta).toBe("Body weight · the extra · 5 to 12 reps");
    expect(p.best).toEqual({ text: "8", unit: "reps", goUp: false, change: "up 2 reps since Oct 6" });
    expect(p.history[0]).toMatchObject({ label: "OCT 27", sets: "8, 7 reps", goUp: false });
    expect(p.swapsNote).toBe("3 for back");
  });

  it("names every day a lift is planned, and says when there is no history", () => {
    const p = buildLift(rowsOf({}), WED, "cable-lateral-raise", "library", true)!;
    expect(p.meta).toBe("Cable · Wednesday and the extra · 10 to 15 reps");
    expect(p.best).toBeNull();
    expect(p.history).toEqual([]);
  });

  it("calls a lift outside the plan a swap", () => {
    const p = buildLift(rows, WED, "cable-crossover", "library", true)!;
    expect(p.meta).toBe("Cable · Swap for chest");
    expect(p.best).toEqual({ text: "30 × 12", unit: "lb", goUp: false, change: "first logged Oct 27" });
    expect(p.swapsNote).toBe("7 for chest");
  });

  it("holds after a drop until the dropped session is logged", () => {
    const dropped = rowsOf({ ...history, lift_drops: [{ exercise_id: "pec-deck", weight_lb: 120, from_date: "2026-11-02", created_at: "2026-11-01T23:00:00Z" }] });
    const p = buildLift(dropped, WED, "pec-deck", "progress", true)!;
    expect(p.best?.goUp).toBe(false);
    expect(p.history[0].next).toBeNull();
  });

  it("works without a plan: no days, every other chest lift as a swap, no workout links", () => {
    const p = buildLift(rowsOf({}), WED, "pec-deck", "library", false)!;
    expect(p.meta).toBe("Machine · Chest");
    expect(p.swapsNote).toBe("11 for chest");
    const withSets = buildLift(rows, WED, "pec-deck", "library", false)!;
    expect(withSets.best?.goUp).toBe(false);
    expect(withSets.history.every((h) => h.to === null && h.next === null)).toBe(true);
  });

  it("is null for an exercise not in the library", () => {
    expect(buildLift(rows, WED, "bench-dips", "library", true)).toBeNull();
  });
});

describe("bestSets", () => {
  it("reads each lift's best set since the phase start", () => {
    expect(bestSets(rows)).toEqual(
      new Map([
        ["incline-dumbbell-press", "55 × 9"],
        ["pec-deck", "130 × 12"],
        ["pull-up", "8 reps"],
        ["cable-crossover", "30 × 12"],
      ]),
    );
  });
});
