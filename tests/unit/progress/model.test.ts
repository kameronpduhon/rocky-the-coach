import { describe, expect, it } from "vitest";
import { addDays } from "~/domain/dates";
import { buildProgress, nextPhotoDate, paceLine } from "~/progress/model";
import type { Row } from "~/sync/tables";

const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-05:00`);
const rowsOf = (t: Record<string, Row[]>) => (name: string) => t[name] ?? [];
const START = "2026-10-05";
const WED = "2026-10-28";
// A weigh-in every day from Oct 5, falling 0.2 lb a day: 207.0, 206.8, ... 202.4 on Oct 28.
const weighIns = (skip: string[] = [], perDay = 0.2): Row[] =>
  Array.from({ length: 24 }, (_, i) => ({ date: addDays(START, i), weight_lb: Math.round((207 - perDay * i) * 10) / 10, logged_at: `${addDays(START, i)}T12:00:00Z` })).filter(
    (w) => !skip.includes(w.date as string),
  );
const done = (client_id: string, date: string, template_id: string): Row => ({
  id: null, client_id, date, template_id, started_at: `${date}T17:00:00Z`, ended_at: `${date}T18:00:00Z`, lifts: null, feel: null,
});
let n = 0;
const set = (key: string, date: string, exercise_id: string, weight_lb: number, reps: number): Row => ({
  id: null, client_id: `s-${++n}`, session_key: key, exercise_id, position: 0, set_number: 1, weight_lb, reps, logged_at: `${date}T17:05:00Z`,
});
const MONDAYS = ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"];
const WEDNESDAYS = ["2026-10-07", "2026-10-14", "2026-10-21"];
const TUESDAYS = ["2026-10-06", "2026-10-13", "2026-10-20", "2026-10-27"];
// Mondays and three Wednesdays done (7 of the 10 planned before today), plus 4 Tuesday extras.
const workouts = {
  workout_sessions: [
    ...MONDAYS.map((d, i) => done(`m${i}`, d, "mon-chest-back-arms")),
    ...WEDNESDAYS.map((d, i) => done(`w${i}`, d, "wed-legs-shoulders")),
    ...TUESDAYS.map((d, i) => done(`t${i}`, d, "optional-arms-back")),
  ],
  set_logs: [
    ...MONDAYS.flatMap((d, i) => [set(`m${i}`, d, "pec-deck", [120, 125, 125, 130][i], 12), set(`m${i}`, d, "incline-dumbbell-press", [45, 50, 50, 55][i], 9)]),
    ...WEDNESDAYS.map((d, i) => set(`w${i}`, d, "leg-press", [250, 260, 280][i], 10)),
    ...TUESDAYS.map((d, i) => set(`t${i}`, d, "pull-up", 0, 6 + i)),
  ],
};
const slots = ["breakfast", "lunch", "snack", "dinner", "dessert"];
const closedDay = (date: string, protein: number, skipDessert = false): Row[] =>
  slots.map((slot) => {
    const skipped = skipDessert && slot === "dessert";
    return { client_id: `${date}-${slot}`, date, slot, meal_slug: skipped ? null : "x", category: skipped ? "skipped" : "planned", kcal: skipped ? 0 : 500, protein_g: skipped ? 0 : protein };
  });
// Two days tracked in full: 5 x 40 = 200 g, and 4 x 35 = 140 g with dessert skipped. Today is half logged and doesn't count.
const meals: Row[] = [...closedDay("2026-10-26", 40), ...closedDay("2026-10-27", 35, true), { client_id: "today", date: WED, slot: "breakfast", meal_slug: "x", category: "planned", kcal: 500, protein_g: 50 }];
const waist: Row[] = [
  { date: "2026-10-11", inches: 35.75 },
  { date: "2026-10-25", inches: 35.5 },
];

describe("buildProgress", () => {
  const m = buildProgress(rowsOf({ weigh_ins: weighIns(), waist_logs: waist, meal_logs: meals, ...workouts }), at(WED, "09:00"));

  it("reads the trend against the Jan 1 goal", () => {
    // The trend reaches 204.04 on Oct 28, from 207.0 on Oct 5: down 3.0. At that pace (-0.90 a week) the 65 days
    // to Jan 1 land at 195.68, inside 195 to 198.
    expect(m.poster).toEqual(["Down 3.0.", "On pace."]);
    expect(m.meta).toBe("Trend 204.0 lb · Jan 1 goal 195 to 198");
    // The chart plots the trend and the pace line's end unrounded; only the labels and the note round them.
    expect(m.chart.projection).toMatchObject({ date: "2027-01-01" });
    expect(m.chart.projection!.weight).toBeCloseTo(195.68, 1);
    expect(m.note).toBe("Dots are daily weigh-ins, the line is the trend. At this pace you land near 196 on Jan 1. Waist matters more during a recomp.");
  });

  it("draws the phase with the goal band, or the last 4 weeks, or everything", () => {
    expect(m.chart.points).toHaveLength(24);
    expect(m.chart.points[0]).toEqual({ date: START, weight: 207, trend: null });
    // The line starts with the third weigh-in: 207, 206.98, 206.942.
    expect(m.chart.points[2]).toMatchObject({ date: "2026-10-07", weight: 206.6 });
    expect(m.chart.points[2].trend).toBeCloseTo(206.942, 6);
    expect(m.chart.goal).toEqual({ date: "2027-01-01", low: 195, high: 198 });
    expect(m.chart.labels).toEqual({ start: "Oct 5 · 207.0", today: "Today 204.0", end: "Jan 1 · 195 to 198" });
    const fourWeeks = buildProgress(rowsOf({ weigh_ins: weighIns() }), at(WED, "09:00"), "4w").chart;
    expect([fourWeeks.points.length, fourWeeks.points[0].date, fourWeeks.goal, fourWeeks.projection, fourWeeks.labels.end]).toEqual([28, "2026-10-01", null, null, null]);
    expect(buildProgress(rowsOf({ weigh_ins: weighIns() }), at(WED, "09:00"), "all").chart.points[0].date).toBe(START);
  });

  it("calls the pace ahead or slower, and leaves it out under 2 weeks", () => {
    expect(paceLine(194.9, { low: 195, high: 198 })).toBe("Ahead of pace.");
    expect(paceLine(198.1, { low: 195, high: 198 })).toBe("Slower than pace.");
    expect(buildProgress(rowsOf({ weigh_ins: weighIns([], 0.3) }), at(WED, "09:00")).poster).toEqual(["Down 4.4.", "Ahead of pace."]);
    expect(buildProgress(rowsOf({ weigh_ins: weighIns([], 0) }), at(WED, "09:00")).poster).toEqual(["Level.", "Slower than pace."]);
    // Oct 5 to 14 is 9 days of trend.
    const early = buildProgress(rowsOf({ weigh_ins: weighIns().slice(0, 10) }), at("2026-10-14", "09:00"));
    expect(early.poster).toEqual(["Down 0.7."]);
    expect(early.note).toBe("Dots are daily weigh-ins, the line is the trend. Waist matters more during a recomp.");
  });

  it("waits for 3 weigh-ins", () => {
    const two = buildProgress(rowsOf({ weigh_ins: weighIns().slice(0, 2) }), at(WED, "09:00"));
    expect(two.poster).toEqual(["Progress.", "No trend yet."]);
    expect(two.meta).toBe("The trend needs 3 weigh-ins.");
  });

  it("lists the last 10 weigh-ins, newest first", () => {
    expect(m.weighIns.map((w) => [w.date, w.weight])).toEqual(
      Array.from({ length: 10 }, (_, i) => [addDays(WED, -i), Math.round((207 - 0.2 * (23 - i)) * 10) / 10]),
    );
  });

  it("shows the waist since the first entry, and the next photo date", () => {
    expect(m.body).toEqual([
      { label: "Waist", value: "35.5 in", sub: "down 0.25 since Oct 11" },
      { label: "Photos", value: "Nov 1", sub: "next set, front side back" },
    ]);
    const empty = buildProgress(rowsOf({}), at("2026-11-01", "09:00"));
    expect(empty.body).toEqual([
      { label: "Waist", value: "Not yet", sub: "Measure at the check-in" },
      { label: "Photos", value: "Today", sub: "front, side, back. They stay on your phone." },
    ]);
    expect(buildProgress(rowsOf({ waist_logs: [waist[0]] }), at(WED, "09:00")).body[0].sub).toBe("measured Oct 11");
  });

  it("schedules progress photos every 4 weeks from the phase start", () => {
    expect(nextPhotoDate("2026-10-12")).toBe("2026-11-01");
    expect(nextPhotoDate("2026-11-01")).toBe("2026-11-01");
    expect(nextPhotoDate("2026-11-02")).toBe("2026-11-29");
  });

  it("puts the most pounds gained first, and counts the lifts", () => {
    expect(m.stronger).toEqual([
      { id: "leg-press", name: "Leg press", from: 250, to: 280 },
      { id: "incline-dumbbell-press", name: "Incline dumbbell press", from: 45, to: 55 },
      { id: "pec-deck", name: "Pec deck", from: 120, to: 130 },
    ]);
    expect(m.liftsLink).toBe("All 21 lifts, best sets and history");
  });

  it("counts the days, the workouts with extras, and protein on tracked days", () => {
    // Oct 5 to 27 all counted (23), and today joins with its weigh-in. Protein: (200 + 140) / 2.
    expect(m.showingUp).toEqual([
      { value: "24 of 24", sub: "days counted" },
      { value: "11 of 10", sub: "workouts, plus extras" },
      { value: "170 g", sub: "protein a day" },
    ]);
    expect(m.streakLine).toBe("Never missed twice in a row. That's the streak that matters.");
  });

  it("counts from the last double miss", () => {
    const gap = buildProgress(rowsOf({ weigh_ins: weighIns(["2026-10-09", "2026-10-10"]) }), at(WED, "09:00"));
    expect(gap.showingUp).toEqual([
      { value: "22 of 24", sub: "days counted" },
      { value: "0 of 10", sub: "workouts" },
      { value: "Not yet", sub: "protein a day" },
    ]);
    expect(gap.streakLine).toBe("18 days since the last double miss. Never miss twice.");
  });
});
