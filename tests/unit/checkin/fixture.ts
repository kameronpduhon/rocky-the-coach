// Seeded weeks for the check-in's rules, as raw rows (the phone's copy and D1 hold the same shapes).
import { addDays } from "~/domain/dates";
import type { Row } from "~/sync/tables";

export type Tables = Record<string, Row[]>;

export const rowsOf = (t: Tables) => (name: string) => t[name] ?? [];

export const SHOULDER = "seated-dumbbell-shoulder-press";
export const BOWL = "chicken-and-rice-bowl";
export const THIGHS = "honey-glazed-chicken-thighs";

const SLOT_KCAL = [
  ["breakfast", 500],
  ["lunch", 600],
  ["snack", 250],
  ["dinner", 600],
  ["dessert", 450],
] as const;

const eaten = (date: string, slot: string, kcal: number): Row => ({
  client_id: `seed-${date}-${slot}`,
  date,
  slot,
  meal_slug: null,
  name: "Seed",
  category: "planned",
  kcal,
  protein_g: 36,
  relaxed: 0,
  portions: 1,
  logged_at: `${date}T18:00:00Z`,
});

/**
 * N3's worked example. A weigh-in every day from Sunday Oct 4, the day before the phase, falling 0.07 lb a day
 * (206.0 to 204.5). Every slot eaten from Oct 5 at 2,400 a day and 180 g protein, except Saturday Oct 24's dessert,
 * which leaves that day partial and out of the math. 7,700 steps a day in week 3 (Oct 19 to 25).
 * The trend: 206.0 on Oct 4, 205.99 on Oct 5, 205.508 on Oct 18, 205.092 on Oct 25.
 * Week 3's burn: 2,400 + 3,500 x (206.0 - 205.092) / 21 = 2,551. Halfway from 2,800: 2,676, to 2,680.
 */
export function threeWeeks(): Tables {
  const t: Tables = { weigh_ins: [], meal_logs: [], steps_daily: [] };
  for (let d = 0; d < 22; d++) {
    const date = addDays("2026-10-04", d);
    t.weigh_ins.push({ date, weight_lb: Math.round((206 - 0.07 * d) * 10) / 10, logged_at: `${date}T12:00:00Z` });
    if (date < "2026-10-05") continue;
    for (const [slot, kcal] of SLOT_KCAL) if (!(date === "2026-10-24" && slot === "dessert")) t.meal_logs.push(eaten(date, slot, kcal));
    if (date >= "2026-10-19") t.steps_daily.push({ date, steps: 7700, updated_at: `${date}T23:00:00Z` });
  }
  return t;
}

const session = (id: number, date: string, template: string): Row => ({
  id,
  client_id: `w-${id}`,
  date,
  template_id: template,
  started_at: `${date}T17:00:00Z`,
  ended_at: `${date}T18:00:00Z`,
  planned_at: `${date}T17:00:00Z`,
  exercises: null,
  lifts: null,
  feel: null,
});

const set = (id: number, date: string, exercise: string, position: number, setNumber: number, weight: number, reps: number): Row => ({
  client_id: `set-${id}-${position}-${setNumber}`,
  session_id: id,
  session_key: `w-${id}`,
  exercise_id: exercise,
  position,
  set_number: setNumber,
  weight_lb: weight,
  reps,
  logged_at: `${date}T17:${String(10 + position * 5 + setNumber).padStart(2, "0")}:00Z`,
});

const dessert = (id: string, date: string, at: string): Row => ({
  client_id: id,
  date,
  slot: null,
  meal_slug: null,
  name: "Sugar-free jello",
  category: "dessert",
  kcal: 0,
  protein_g: 0,
  relaxed: 0,
  portions: 1,
  logged_at: at,
});

/**
 * Week 3 (Mon Oct 19 to Sun Oct 25) on top of threeWeeks(). None of it moves the engine's numbers.
 * - Lunch Mon to Thu is the chicken and rice bowl (4 times); dinner Mon, Wed and Fri the honey-glazed thighs (3 times).
 * - Thursday's snack has 12 g protein and its dinner none: 36 x 3 + 12 = 120 g. Every other tracked day is 180 g, so
 *   the six tracked days average 1,020 / 6 = 170 g. Saturday stays partial (no dessert): 144 g, not tracked.
 * - Saturday walked 5,900. The week averages (7,700 x 6 + 5,900) / 7 = 7,443, still over the 7,000 goal, so the
 *   ramp stays at 7,500.
 * - Three off-plan desserts at 0 cal, two Friday and one Sunday: Sunday's is past the 2 allowed, so Sunday isn't a
 *   full day. Full days: Mon, Tue, Wed and Fri, 4.
 * - Workouts: Mon incline press 50 x 10, 10 and pec deck 130 x 12, 12 (both at the top: 55 and 135 next).
 *   Tuesday's extra: hammer curl 30 x 10. Wed shoulder press 45 x 8, 7, as on Oct 7 and Oct 14 (stuck, drop 40).
 *   Friday missed.
 * - Waist 35.75 on Oct 11 and 35.5 on Sunday Oct 25.
 * - Steak and baked potato rested until Oct 21 (back next week), salmon and rice until Nov 3 (still resting next
 *   Monday), burger bowl until Oct 18 (back before this week).
 */
export function weekThree(): Tables {
  const t = threeWeeks();
  t.meal_logs = t.meal_logs.map((l) => {
    const date = l.date as string;
    const slot = l.slot as string;
    if (slot === "lunch" && date >= "2026-10-19" && date <= "2026-10-22") return { ...l, meal_slug: BOWL };
    if (slot === "dinner" && ["2026-10-19", "2026-10-21", "2026-10-23"].includes(date)) return { ...l, meal_slug: THIGHS };
    if (date === "2026-10-22" && slot === "snack") return { ...l, protein_g: 12 };
    if (date === "2026-10-22" && slot === "dinner") return { ...l, protein_g: 0 };
    return l;
  });
  t.meal_logs.push(dessert("d-1", "2026-10-23", "2026-10-23T23:30:00Z"), dessert("d-2", "2026-10-23", "2026-10-23T23:45:00Z"), dessert("d-3", "2026-10-25", "2026-10-25T23:30:00Z"));
  t.steps_daily = t.steps_daily.map((s) => (s.date === "2026-10-24" ? { ...s, steps: 5900 } : s));
  t.workout_sessions = [
    session(1007, "2026-10-07", "wed-legs-shoulders"),
    session(1014, "2026-10-14", "wed-legs-shoulders"),
    session(1019, "2026-10-19", "mon-chest-back-arms"),
    session(1020, "2026-10-20", "optional-arms-back"),
    session(1021, "2026-10-21", "wed-legs-shoulders"),
  ];
  t.set_logs = [
    ...([
      [1007, "2026-10-07"],
      [1014, "2026-10-14"],
      [1021, "2026-10-21"],
    ] as const).flatMap(([id, date]) => [set(id, date, SHOULDER, 4, 1, 45, 8), set(id, date, SHOULDER, 4, 2, 45, 7)]),
    set(1019, "2026-10-19", "incline-dumbbell-press", 0, 1, 50, 10),
    set(1019, "2026-10-19", "incline-dumbbell-press", 0, 2, 50, 10),
    set(1019, "2026-10-19", "pec-deck", 1, 1, 130, 12),
    set(1019, "2026-10-19", "pec-deck", 1, 2, 130, 12),
    set(1020, "2026-10-20", "hammer-curl", 2, 1, 30, 10),
  ];
  t.waist_logs = [
    { date: "2026-10-11", inches: 35.75 },
    { date: "2026-10-25", inches: 35.5 },
  ];
  t.meal_state = [
    { slug: "steak-and-baked-potato", photo_key: null, rested_until: "2026-10-21" },
    { slug: "salmon-and-rice", photo_key: null, rested_until: "2026-11-03" },
    { slug: "burger-bowl", photo_key: null, rested_until: "2026-10-18" },
  ];
  return t;
}

/** A saved check-in row, for the week before, with only what a test sets. */
export function checkInRow(weekStart: string, over: Row = {}): Row {
  return {
    week_start: weekStart,
    avg_weight: null,
    change: null,
    adherence: 0,
    outcome: "{}",
    completed_at: "2026-10-18T23:00:00.000Z",
    burn: null,
    burn_state: null,
    intake_avg: null,
    tracked_days: null,
    hunger: null,
    energy: null,
    sleep: null,
    ...over,
  };
}
