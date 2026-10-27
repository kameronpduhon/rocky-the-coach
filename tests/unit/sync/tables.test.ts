import { describe, expect, it } from "vitest";
import { SYNCED, keyOf, tableDef } from "~/sync/tables";

describe("sync tables", () => {
  it("keys rows the same way the SQL does", () => {
    expect(keyOf("weigh_ins", { date: "2026-10-27", weight_lb: 205 })).toBe("2026-10-27");
    expect(keyOf("planned_meals", { date: "2026-10-27", slot: "lunch" })).toBe("2026-10-27|lunch");
    expect(keyOf("meal_logs", { id: 7, client_id: null })).toBe("id:7");
    expect(keyOf("meal_logs", { id: 7, client_id: "c-1" })).toBe("c-1");
    expect(keyOf("exercise_swaps", { date: "2026-10-28", template_id: "wed", position: 2 })).toBe("2026-10-28|wed|2");
    expect(keyOf("workout_sessions", { id: 3, client_id: null })).toBe("id:3");
    expect(keyOf("workout_sessions", { id: 3, client_id: "w-1" })).toBe("w-1");
    expect(keyOf("exercise_checks", { session_key: "w-1", exercise_id: "leg-curl" })).toBe("w-1|leg-curl");
  });

  it("builds key SQL for triggers and lookups", () => {
    expect(tableDef("meal_logs").keySql("NEW.")).toBe("COALESCE(NEW.client_id, 'id:' || NEW.id)");
    expect(tableDef("grocery_checks").keySql("")).toBe("week_start || '|' || food_id");
  });

  it("syncs the 19 personal tables and nothing server-only", () => {
    expect(SYNCED).toHaveLength(19);
    for (const t of ["push_subscriptions", "notifications_sent", "login_attempts", "changes", "sync_clients", "vitals"]) {
      expect(SYNCED.map((d) => d.name)).not.toContain(t);
    }
  });
});
