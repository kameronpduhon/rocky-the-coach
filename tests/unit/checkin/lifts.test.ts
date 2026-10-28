import { describe, expect, it } from "vitest";
import { liftWeek } from "~/checkin/lifts";
import { rowsOf, SHOULDER, weekThree, type Tables } from "./fixture";

describe("liftWeek", () => {
  it("counts planned, done, extras and misses, and finds what moved up and what is stuck", () => {
    expect(liftWeek(rowsOf(weekThree()), "2026-10-19", "2026-10-26")).toEqual({
      planned: 3,
      plannedDone: 2,
      extras: ["2026-10-20"],
      missed: ["2026-10-23"],
      movedUp: [
        { exercise: "incline-dumbbell-press", name: "Incline dumbbell press", from: 50, to: 55 },
        { exercise: "pec-deck", name: "Pec deck", from: 130, to: 135 },
      ],
      stuck: [{ exercise: SHOULDER, name: "Seated dumbbell shoulder press", top: 45, lastSets: [{ weight: 45, reps: 8 }, { weight: 45, reps: 7 }], chase: [8, 8], drop: 40 }],
      nextWeekDeload: false,
    });
  });

  it("counts only past days as missed while the week is still going", () => {
    expect(liftWeek(rowsOf(weekThree()), "2026-10-19", "2026-10-22")).toMatchObject({ plannedDone: 2, missed: [] });
  });

  it("moves nothing up and plans nothing for a stuck lift when next week is the deload", () => {
    // Week 7 (Nov 16 to 22): the pec deck hit the top, but week 8 is the deload.
    const t: Tables = {
      workout_sessions: [{ id: 2000, client_id: "w-2000", date: "2026-11-16", template_id: "mon-chest-back-arms", started_at: "2026-11-16T17:00:00Z", ended_at: "2026-11-16T18:00:00Z", planned_at: null, exercises: null, lifts: null, feel: null }],
      set_logs: [1, 2].map((n) => ({ client_id: `s-${n}`, session_id: 2000, session_key: "w-2000", exercise_id: "pec-deck", position: 1, set_number: n, weight_lb: 130, reps: 12, logged_at: `2026-11-16T17:0${n}:00Z` })),
    };
    expect(liftWeek(rowsOf(t), "2026-11-16", "2026-11-23")).toMatchObject({ movedUp: [], stuck: [], nextWeekDeload: true });
  });
});
