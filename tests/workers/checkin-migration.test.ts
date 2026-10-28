import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const SHOULDER = "seated-dumbbell-shoulder-press";

describe("the P4a migration", () => {
  it("keeps a v1 check-in with no taps, and logs every write to lift_drops", async () => {
    const d1 = env.MIGRATION_TEST;
    const split = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith("0010"));
    await applyD1Migrations(d1, env.TEST_MIGRATIONS.slice(0, split));
    await d1
      .prepare("INSERT INTO check_ins (week_start, avg_weight, change, adherence, outcome, completed_at) VALUES ('2026-10-12', 206.3, -0.8, 6, '{}', '2026-10-18T23:00:00.000Z')")
      .run();

    await applyD1Migrations(d1, env.TEST_MIGRATIONS);

    expect((await d1.prepare("SELECT week_start, adherence, hunger, energy, sleep FROM check_ins").all()).results).toEqual([
      { week_start: "2026-10-12", adherence: 6, hunger: null, energy: null, sleep: null },
    ]);
    const before = (await d1.prepare("SELECT COUNT(*) AS n FROM changes").first<{ n: number }>())!.n;
    await d1.prepare(`INSERT INTO lift_drops (exercise_id, weight_lb, from_date, created_at) VALUES ('${SHOULDER}', 40, '2026-10-26', '2026-10-25T23:00:00.000Z')`).run();
    await d1.prepare(`UPDATE lift_drops SET weight_lb = 35 WHERE exercise_id = '${SHOULDER}'`).run();
    await d1.prepare("DELETE FROM lift_drops").run();
    expect((await d1.prepare("SELECT table_name, row_key, op FROM changes ORDER BY version").all()).results.slice(before)).toEqual([
      { table_name: "lift_drops", row_key: SHOULDER, op: "put" },
      { table_name: "lift_drops", row_key: SHOULDER, op: "put" },
      { table_name: "lift_drops", row_key: SHOULDER, op: "del" },
    ]);
  });
});
