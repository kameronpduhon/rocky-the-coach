import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("the W1 migration", () => {
  it("keeps every v1 workout and set, links them by key, and copies custom lists", async () => {
    const d1 = env.MIGRATION_TEST;
    const split = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith("0006"));
    await applyD1Migrations(d1, env.TEST_MIGRATIONS.slice(0, split));
    await d1.batch([
      d1.prepare("INSERT INTO workout_sessions (id, date, template_id, started_at, ended_at) VALUES (1, '2026-10-21', 'wed-legs-shoulders', '2026-10-21T17:00:00Z', '2026-10-21T18:00:00Z')"),
      d1.prepare(`INSERT INTO workout_sessions (id, date, template_id, started_at, exercises) VALUES (2, '2026-10-22', 'custom', '2026-10-22T17:00:00Z', '["leg-press","leg-curl"]')`),
      d1.prepare("INSERT INTO set_logs (session_id, exercise_id, position, set_number, weight_lb, reps, logged_at) VALUES (1, 'leg-press', 0, 1, 270, 12, '2026-10-21T17:05:00Z')"),
      d1.prepare("INSERT INTO exercise_checks (session_id, exercise_id) VALUES (1, 'leg-curl')"),
      d1.prepare("INSERT INTO exercise_checks (session_id, exercise_id) VALUES (2, 'leg-press')"),
    ]);

    await applyD1Migrations(d1, env.TEST_MIGRATIONS);

    expect(await d1.prepare("SELECT count(*) AS n FROM workout_sessions").first()).toEqual({ n: 2 });
    expect(await d1.prepare("SELECT session_key FROM set_logs").first()).toEqual({ session_key: "id:1" });
    expect((await d1.prepare("SELECT session_key FROM exercise_checks ORDER BY session_id").all()).results).toEqual([{ session_key: "id:1" }, { session_key: "id:2" }]);
    const custom = await d1.prepare("SELECT lifts, started_at FROM workout_sessions WHERE id = 2").first<{ lifts: string; started_at: string }>();
    expect(JSON.parse(custom!.lifts)).toEqual([
      { position: 0, exercise: "leg-press", repMin: 8, repMax: 12, from: "added" },
      { position: 1, exercise: "leg-curl", repMin: 8, repMax: 12, from: "added" },
    ]);
    expect(custom!.started_at).toBe("2026-10-22T17:00:00Z");
    expect(await d1.prepare("SELECT lifts FROM workout_sessions WHERE id = 1").first()).toEqual({ lifts: null });
  });
});
