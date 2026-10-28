import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { logWeighIn, deleteWeighIn } from "~/server/body.server";
import { logOffPlan } from "~/server/meals.server";
import { db } from "./helpers";

const changes = async () =>
  (await env.DB.prepare("select table_name, row_key, op from changes order by version").all()).results;

describe("sync triggers", () => {
  it("logs puts and deletes made by v1 server code", async () => {
    // The migrations' seeded rows are logged too, so look only at what this test writes.
    const before = (await changes()).length;
    await logWeighIn(db(), "2026-10-27", 205.1, new Date());
    await logWeighIn(db(), "2026-10-27", 204.9, new Date());
    await deleteWeighIn(db(), "2026-10-27");
    expect((await changes()).slice(before)).toEqual([
      { table_name: "weigh_ins", row_key: "2026-10-27", op: "put" },
      { table_name: "weigh_ins", row_key: "2026-10-27", op: "put" },
      { table_name: "weigh_ins", row_key: "2026-10-27", op: "del" },
    ]);
  });

  it("keys rows without a client id by their id", async () => {
    await logOffPlan(db(), "2026-10-27", { name: "Ranch Water", category: "drink", kcal: 100, proteinG: 0, relaxed: false }, new Date());
    const last = (await changes()).at(-1) as { row_key: string };
    expect(last.row_key).toMatch(/^id:\d+$/);
  });

  it("does not log tables that do not sync", async () => {
    const before = (await changes()).length;
    await env.DB.prepare("insert into notifications_sent (kind, date) values ('weigh-in', '2026-10-27')").run();
    expect((await changes()).length).toBe(before);
  });

  it("keys workouts by their phone id, checks by workout key and exercise, and logs notes", async () => {
    await env.DB.prepare("INSERT INTO workout_sessions (client_id, date, template_id, planned_at) VALUES ('w-t', '2026-10-28', 'wed-legs-shoulders', '2026-10-28T12:00:00Z')").run();
    await env.DB.prepare("INSERT INTO exercise_checks (session_id, session_key, exercise_id) VALUES (99, 'w-t', 'leg-curl')").run();
    await env.DB.prepare("INSERT INTO exercise_notes (exercise_id, note, updated_at) VALUES ('leg-press', 'seat on 4', '2026-10-28T12:00:00Z')").run();
    expect((await changes()).slice(-3)).toEqual([
      { table_name: "workout_sessions", row_key: "w-t", op: "put" },
      { table_name: "exercise_checks", row_key: "w-t|leg-curl", op: "put" },
      { table_name: "exercise_notes", row_key: "leg-press", op: "put" },
    ]);
  });

  it("keys batches by their phone id and logs usual orders", async () => {
    await env.DB.prepare("INSERT INTO batches (client_id, meal_slug, portions, cooked_weight_g, portion_g, created_on, portions_left, factor) VALUES ('b-t', 'chicken-and-rice-bowl', 2, 400, 200, '2026-10-27', 2, 1)").run();
    await env.DB.prepare("INSERT INTO usual_orders (client_id, name, category, kcal, protein_g, relaxed, uses, created_at) VALUES ('u-t', 'Quest bar', 'snack', 190, 21, 0, 0, '2026-10-27T00:00:00Z')").run();
    expect((await changes()).slice(-2)).toEqual([
      { table_name: "batches", row_key: "b-t", op: "put" },
      { table_name: "usual_orders", row_key: "u-t", op: "put" },
    ]);
  });
});
