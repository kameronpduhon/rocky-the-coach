import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { processPush } from "~/sync/push.server";
import { BOWL, SHOULDER, weekThree, type Tables } from "../unit/checkin/fixture";

async function seed(d1: D1Database, t: Tables) {
  const statements: D1PreparedStatement[] = [];
  for (const [table, rows] of Object.entries(t)) {
    for (const r of rows) {
      const cols = Object.keys(r);
      statements.push(d1.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).bind(...cols.map((c) => r[c] ?? null)));
    }
  }
  await d1.batch(statements);
}

const finish = {
  week: "2026-10-19",
  at: "2026-10-25T23:00:00.000Z",
  pick: "calories",
  hunger: "high",
  energy: "fine",
  sleep: "great",
  rest: [BOWL],
  lifts: [{ exercise: SHOULDER, plan: "drop" }],
  // Not in the schema: dropped, so it can't set a number.
  kcal: 1200,
};

async function expectFinished(d1: D1Database) {
  expect(await d1.prepare("SELECT kcal, protein_g, step_goal FROM targets WHERE effective_from = '2026-10-26'").first()).toEqual({ kcal: 2300, protein_g: 180, step_goal: 7500 });
  expect(await d1.prepare("SELECT avg_weight, change, adherence, burn, burn_state, intake_avg, tracked_days, hunger, energy, sleep FROM check_ins WHERE week_start = '2026-10-19'").first()).toEqual({
    avg_weight: 205.1,
    change: -0.4,
    adherence: 4,
    burn: 2680,
    burn_state: "settling",
    intake_avg: 2400,
    tracked_days: 6,
    hunger: "high",
    energy: "fine",
    sleep: "great",
  });
  expect(await d1.prepare(`SELECT rested_until FROM meal_state WHERE slug = '${BOWL}'`).first()).toEqual({ rested_until: "2026-11-08" });
  expect(await d1.prepare("SELECT exercise_id, weight_lb, from_date FROM lift_drops").all().then((r) => r.results)).toEqual([{ exercise_id: SHOULDER, weight_lb: 40, from_date: "2026-10-26" }]);
  expect(await d1.prepare("SELECT COUNT(*) AS n FROM planned_meals WHERE date BETWEEN '2026-10-26' AND '2026-11-01'").first()).toEqual({ n: 35 });
}

describe("finishCheckIn through push", () => {
  it("saves the same numbers as the phone in Kameron's database, and only there", async () => {
    await seed(env.DB, weekThree());
    const res = await processPush(env.DB, { clientId: "phone-checkin-k", mutations: [{ id: 1, name: "finishCheckIn", args: finish }] }, new Date("2026-10-25T23:05:00Z"));
    expect(res.rejected).toEqual([]);
    await expectFinished(env.DB);
    expect(await env.DB_CATHERINE.prepare("SELECT COUNT(*) AS n FROM check_ins").first()).toEqual({ n: 0 });
  });

  it("does the same in Catherine's", async () => {
    await seed(env.DB_CATHERINE, weekThree());
    const res = await processPush(env.DB_CATHERINE, { clientId: "phone-checkin-c", mutations: [{ id: 1, name: "finishCheckIn", args: finish }] }, new Date("2026-10-25T23:05:00Z"));
    expect(res.rejected).toEqual([]);
    await expectFinished(env.DB_CATHERINE);
  });

  it("refuses the same week again after Monday 3am", async () => {
    const res = await processPush(env.DB, { clientId: "phone-checkin-k", mutations: [{ id: 2, name: "finishCheckIn", args: { ...finish, at: "2026-10-26T09:00:00.000Z" } }] }, new Date("2026-10-26T09:05:00Z"));
    expect(res.rejected).toEqual([{ id: 2, message: "That check-in is already finished." }]);
  });
});
