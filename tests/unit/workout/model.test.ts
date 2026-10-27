import { describe, expect, it } from "vitest";
import { meals, plan } from "~/content";
import { parseTime } from "~/domain/dates";
import type { Row } from "~/sync/tables";
import { buildWorkout, lastLine, nextOpen, nextTarget, restLeft, setsText, standingLine } from "~/workout/model";

const WED = "2026-10-28";
const LAST_WED = "2026-10-21";
const LEGS = "wed-legs-shoulders";
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-05:00`);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const rowsOf = (t: Record<string, Row[]>) => (name: string) => t[name] ?? [];
const merge = (...ts: Record<string, Row[]>[]) => {
  const out: Record<string, Row[]> = {};
  for (const t of ts) for (const [k, v] of Object.entries(t)) out[k] = [...(out[k] ?? []), ...v];
  return out;
};
const session = (o: Row): Row => ({ id: null, client_id: "w-1", date: WED, template_id: LEGS, started_at: null, ended_at: null, planned_at: `${WED}T14:00:00Z`, lifts: null, feel: null, exercises: null, ...o });
let n = 0;
const set = (o: Row): Row => ({ id: null, client_id: `s-${++n}`, session_id: null, session_key: "w-1", exercise_id: "leg-press", position: 0, set_number: 1, weight_lb: 280, reps: 11, logged_at: `${WED}T17:05:00Z`, ...o });

// Last Wednesday: leg press 270 x 12, 12, the top of its 8 to 12 range.
const history = (feel: string | null = null) => ({
  workout_sessions: [session({ id: 9, client_id: null, date: LAST_WED, started_at: `${LAST_WED}T17:00:00Z`, ended_at: `${LAST_WED}T18:00:00Z`, feel })],
  set_logs: [
    set({ session_key: "id:9", weight_lb: 270, reps: 12, logged_at: `${LAST_WED}T17:05:00Z` }),
    set({ session_key: "id:9", set_number: 2, weight_lb: 270, reps: 12, logged_at: `${LAST_WED}T17:09:00Z` }),
  ],
});

describe("buildWorkout", () => {
  it("opens Plan on today's scheduled workout before anything is saved", () => {
    const m = buildWorkout(rowsOf(history()), at(WED, "08:00"));
    expect(m).toMatchObject({ screen: "plan", key: null, templateId: LEGS, live: true, headline: ["Legs.", "Shoulders."], totals: { lifts: 6, sets: 12, minutes: 45 } });
    expect(m.choices.map((c) => c.label)).toEqual(["Legs, shoulders", "Chest, back, arms", "Chest, shoulders, arms", "Short, home", "Your own"]);
    expect(m.lifts[0]).toMatchObject({ name: "Leg press", rest: 150, suggestion: { weight: 280, goUp: true } });
    expect(lastLine(m.lifts[0], m.date)).toEqual({ goUp: true, text: "Last Wednesday: 270 × 12, 12. Both sets hit the top, so 280 today." });
    expect(m.canMove).toBe(true);
  });

  it("holds last week's weight after a hard workout", () => {
    const m = buildWorkout(rowsOf(history("hard")), at(WED, "08:00"));
    expect(m.lifts[0].suggestion).toEqual({ weight: 270, goUp: false });
    expect(lastLine(m.lifts[0], m.date)).toEqual({ goUp: false, text: "Last Wednesday: 270 × 12, 12. It felt hard, so 270 again today." });
  });

  it("keeps logged sets with their lift after swaps, adds and skips", () => {
    const lifts = [
      { position: 0, exercise: "leg-press", repMin: 8, repMax: 12, from: "plan" },
      { position: 2, exercise: "lying-leg-curl", repMin: 10, repMax: 12, from: "plan" },
      { position: 5, exercise: "dumbbell-lateral-raise", repMin: 10, repMax: 15, from: "swap", replaces: "cable-lateral-raise" },
      { position: 100, exercise: "hammer-curl", repMin: 8, repMax: 12, from: "added" },
    ];
    const rows = rowsOf({
      workout_sessions: [session({ started_at: `${WED}T17:00:00Z`, lifts: JSON.stringify(lifts) })],
      set_logs: [set({ exercise_id: "hammer-curl", position: 100, weight_lb: 35, reps: 10 })],
    });
    const m = buildWorkout(rows, at(WED, "12:30"));
    expect(m.screen).toBe("set");
    expect(m.lifts.map((l) => l.position)).toEqual([0, 2, 5, 100]);
    expect(m.lifts[2]).toMatchObject({ name: "Dumbbell lateral raise", from: "swap" });
    expect(m.lifts[3].sets).toMatchObject([{ setNumber: 1, weight: 35, reps: 10 }]);
    expect(m.current?.position).toBe(0);
  });

  it("picks the current lift and the next set's target", () => {
    const started = merge(history(), { workout_sessions: [session({ started_at: `${WED}T17:00:00Z` })] });
    const one = buildWorkout(rowsOf(merge(started, { set_logs: [set({})] })), at(WED, "12:10"));
    expect(one.current?.name).toBe("Leg press");
    expect(nextTarget(one.current!, one.setsPerLift)).toEqual({ setNumber: 2, weight: 280, reps: 12 });
    expect(standingLine(one.current!, one.setsPerLift)).toBe("11 on set 1, so 280 holds next week. Match or beat it here.");

    const both = buildWorkout(rowsOf(merge(started, { set_logs: [set({}), set({ set_number: 2, reps: 12, logged_at: `${WED}T17:09:00Z` })] })), at(WED, "12:10"));
    expect(both.current?.name).toBe("Dumbbell Romanian deadlift");
    expect(nextTarget(both.current!, both.setsPerLift)).toEqual({ setNumber: 1, weight: null, reps: 8 });
    expect(nextOpen(both.lifts, 0)?.position).toBe(1);
  });

  it("counts the rest down from the last set after a reopen", () => {
    const rows = rowsOf({ workout_sessions: [session({ started_at: `${WED}T17:00:00Z` })], set_logs: [set({})] });
    const m = buildWorkout(rows, at(WED, "12:06"));
    expect(restLeft(m, Date.parse(`${WED}T17:06:00Z`))).toEqual({ endsAt: Date.parse(`${WED}T17:07:30Z`), total: 150, position: 0, next: { position: 0, setNumber: 2, name: "Leg press" } });
    expect(restLeft(m, Date.parse(`${WED}T17:08:00Z`))).toBeNull();
  });

  it("lists what moved up on Done, and the feel changes it", () => {
    const done = (feel: string | null) =>
      rowsOf({
        workout_sessions: [session({ started_at: `${WED}T17:00:00Z`, ended_at: `${WED}T18:00:00Z`, feel })],
        set_logs: [
          set({ reps: 12 }),
          set({ set_number: 2, reps: 12 }),
          set({ exercise_id: "lying-leg-curl", position: 2, weight_lb: 110, reps: 12 }),
          set({ exercise_id: "lying-leg-curl", position: 2, set_number: 2, weight_lb: 110, reps: 12 }),
        ],
      });
    const m = buildWorkout(done(null), at(WED, "13:10"));
    expect(m.screen).toBe("done");
    expect(m.movedUp).toEqual([{ name: "Leg press", from: 280, to: 290 }, { name: "Lying leg curl", from: 110, to: 120 }]);
    expect(m.totals).toEqual({ lifts: 2, sets: 4, minutes: 60 });
    expect(m.rockyLine).toBe("Two lifts moved up.");
    expect(setsText(m.lifts[0].sets)).toBe("280 × 12, 12");
    expect(buildWorkout(done("hard"), at(WED, "13:10")).movedUp).toEqual([]);
    expect(buildWorkout(done("easy"), at(WED, "13:10")).movedUp[0]).toEqual({ name: "Leg press", from: 280, to: 300 });
  });

  it("names the next meal in Rocky's line when it is close", () => {
    const lunch = [...meals.values()].find((x) => x.pool === "main" && x.mode === "any")!;
    const rows = rowsOf({
      workout_sessions: [session({ started_at: `${WED}T17:00:00Z`, ended_at: `${WED}T18:00:00Z` })],
      set_logs: [set({})],
      planned_meals: [{ date: WED, slot: "lunch", meal_slug: lunch.slug, swapped: 0 }],
    });
    const m = buildWorkout(rows, at(WED, hhmm(parseTime(plan.slotTimes.lunch) - 30)));
    expect(m.rockyLine).toBe(`Same weights next week. Beat the reps. ${lunch.name} within the hour.`);
  });

  it("reads yesterday's unfinished workout as finished, and today starts fresh", () => {
    const TUE = "2026-10-27";
    const rows = rowsOf({
      workout_sessions: [session({ client_id: "w-0", date: TUE, started_at: `${TUE}T17:00:00Z` })],
      set_logs: [set({ session_key: "w-0", logged_at: `${TUE}T17:20:00Z` })],
    });
    expect(buildWorkout(rows, at(WED, "09:00"), { date: TUE })).toMatchObject({ screen: "done", live: false, endedAt: null, finishedAt: `${TUE}T17:20:00Z` });
    expect(buildWorkout(rows, at(WED, "09:00"))).toMatchObject({ screen: "plan", key: null });
  });

  it("shows a planned workout on Plan, and starts a second workout when another is asked for after a finish", () => {
    expect(buildWorkout(rowsOf({ workout_sessions: [session({})] }), at(WED, "09:00"))).toMatchObject({ screen: "plan", key: "w-1" });
    const finished = rowsOf({ workout_sessions: [session({ started_at: `${WED}T17:00:00Z`, ended_at: `${WED}T18:00:00Z` })] });
    expect(buildWorkout(finished, at(WED, "15:00"), { template: "custom" })).toMatchObject({ screen: "plan", key: null, templateId: "custom", lifts: [] });
    expect(buildWorkout(finished, at(WED, "15:00"), { template: LEGS })).toMatchObject({ screen: "done", key: "w-1" });
  });

  it("writes weights that changed set to set in full", () => {
    expect(setsText([{ weight: 270, reps: 12 }, { weight: 260, reps: 10 }])).toBe("270 × 12, 260 × 10");
  });
  it("keeps a rest day's optional workout in the picker after another is picked", () => {
    const TUE = "2026-10-27";
    const optional = plan.optional[String(new Date(`${TUE}T12:00:00Z`).getUTCDay())]!;
    const m = buildWorkout(rowsOf({ workout_sessions: [session({ date: TUE })] }), at(TUE, "09:00"));
    expect(m.templateId).toBe(LEGS);
    expect(m.choices.map((c) => c.templateId)).toContain(optional);
  });
});
