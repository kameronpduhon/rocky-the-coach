import { describe, expect, it } from "vitest";
import type { Row } from "~/sync/tables";
import { doneDates, finishedAt, lastSession, loggedDates, sessionKey, setsBySession } from "~/workout/sessions";

const rowsOf = (t: Record<string, Row[]>) => (name: string) => t[name] ?? [];
const session = (o: Row): Row => ({ id: null, client_id: null, template_id: "wed-legs-shoulders", started_at: null, ended_at: null, planned_at: null, lifts: null, feel: null, exercises: null, ...o });
let n = 0;
const set = (o: Row): Row => ({ id: null, client_id: `s-${++n}`, session_id: null, exercise_id: "leg-press", position: 0, set_number: 1, weight_lb: 270, reps: 12, logged_at: "2026-10-21T17:10:00Z", ...o });

describe("workout sessions", () => {
  it("keys a phone-made workout by client id and a v1 one by id", () => {
    expect(sessionKey(session({ client_id: "w-1" }))).toBe("w-1");
    expect(sessionKey(session({ id: 9 }))).toBe("id:9");
  });

  it("links a set logged offline by its key, with no session_id yet", () => {
    expect(setsBySession(rowsOf({ set_logs: [set({ session_key: "w-1" })] })).get("w-1")).toHaveLength(1);
  });

  it("reads a workout started and never finished as finished from the next day, at its last set", () => {
    const w = session({ client_id: "w-1", date: "2026-10-21", started_at: "2026-10-21T17:00:00Z" });
    const sets = [set({ session_key: "w-1", logged_at: "2026-10-21T17:40:00Z" }), set({ session_key: "w-1", set_number: 2, logged_at: "2026-10-21T17:44:00Z" })];
    expect(finishedAt(w, sets, "2026-10-21")).toBeNull();
    expect(finishedAt(w, sets, "2026-10-22")).toBe("2026-10-21T17:44:00Z");
    expect(finishedAt(session({ date: "2026-10-21" }), [], "2026-10-22")).toBeNull();
    expect(finishedAt(session({ date: "2026-10-21", ended_at: "2026-10-21T18:00:00Z" }), [], "2026-10-21")).toBe("2026-10-21T18:00:00Z");
  });

  it("counts a day with sets or checks as logged, and a planned workout as nothing", () => {
    const rows = rowsOf({
      workout_sessions: [
        session({ client_id: "w-1", date: "2026-10-21" }),
        session({ client_id: "w-2", date: "2026-10-22" }),
        session({ client_id: "w-3", date: "2026-10-23", started_at: "2026-10-23T17:00:00Z" }),
        session({ client_id: "w-4", date: "2026-10-24" }),
      ],
      set_logs: [set({ session_key: "w-1" })],
      exercise_checks: [{ session_id: null, session_key: "w-2", exercise_id: "leg-press" }],
    });
    expect(loggedDates(rows)).toEqual(new Set(["2026-10-21", "2026-10-22"]));
    expect(doneDates(rows, "2026-10-25")).toEqual(new Set(["2026-10-21", "2026-10-22", "2026-10-23"]));
  });

  it("finds the last workout's sets for an exercise, with how it felt", () => {
    const rows = rowsOf({
      workout_sessions: [
        session({ id: 9, date: "2026-10-14", ended_at: "2026-10-14T18:00:00Z" }),
        session({ client_id: "w-1", date: "2026-10-21", feel: "hard" }),
        session({ client_id: "w-2", date: "2026-10-28" }),
      ],
      set_logs: [
        set({ session_key: "id:9", weight_lb: 260 }),
        set({ session_key: "w-1", set_number: 2, reps: 11 }),
        set({ session_key: "w-1", set_number: 1 }),
        set({ session_key: "w-2", weight_lb: 280 }),
      ],
    });
    expect(lastSession(rows, "leg-press", "2026-10-28")).toEqual({ date: "2026-10-21", feel: "hard", sets: [{ weight: 270, reps: 12 }, { weight: 270, reps: 11 }] });
    expect(lastSession(rows, "pec-deck", "2026-10-28")).toBeNull();
  });
});
