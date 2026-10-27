import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { meals, plan } from "~/content";
import { processPush } from "~/sync/push.server";
import { StorageError } from "~/sync/server-tx.server";

const now = new Date("2026-10-27T16:00:00Z");

describe("push", () => {
  it("applies mutations in order and records the last one", async () => {
    const res = await processPush(env.DB, {
      clientId: "phone-a",
      mutations: [
        { id: 1, name: "logWeighIn", args: { date: "2026-10-27", weightLb: 205.2 } },
        { id: 2, name: "editWeighIn", args: { date: "2026-10-27", weightLb: 205.0 } },
      ],
    }, now);
    expect(res).toEqual({ lastMutationId: 2, rejected: [] });
    expect(await env.DB.prepare("select weight_lb from weigh_ins where date = '2026-10-27'").first()).toEqual({ weight_lb: 205 });
  });

  it("skips mutations it already applied", async () => {
    const body = { clientId: "phone-b", mutations: [{ id: 1, name: "logOffPlan", args: { clientId: "x-1", date: "2026-10-27", name: "Chips", category: "snack", kcal: 160, proteinG: 2, relaxed: false } }] };
    await processPush(env.DB, body, now);
    await processPush(env.DB, body, now);
    expect(await env.DB.prepare("select count(*) as n from meal_logs where client_id = 'x-1'").first()).toEqual({ n: 1 });
  });

  it("reports a rejected mutation and still moves past it", async () => {
    const res = await processPush(env.DB, {
      clientId: "phone-c",
      mutations: [
        { id: 1, name: "logWeighIn", args: { date: "2026-10-27", weightLb: 10 } },
        { id: 2, name: "setVoice", args: { voice: "plain" } },
      ],
    }, now);
    expect(res.lastMutationId).toBe(2);
    expect(res.rejected).toEqual([{ id: 1, message: expect.any(String) }]);
    expect(await env.DB.prepare("select voice from profile where id = 'me'").first()).toEqual({ voice: "plain" });
  });

  it("writes to the database it is given and no other", async () => {
    await processPush(env.DB_CATHERINE, { clientId: "phone-d", mutations: [{ id: 1, name: "logWeighIn", args: { date: "2026-10-26", weightLb: 140 } }] }, now);
    expect(await env.DB_CATHERINE.prepare("select count(*) as n from weigh_ins where date = '2026-10-26'").first()).toEqual({ n: 1 });
    expect(await env.DB.prepare("select count(*) as n from weigh_ins where date = '2026-10-26'").first()).toEqual({ n: 0 });
  });

  it("logs a planned meal and uses a batch portion on the real database", async () => {
    const meal = [...meals.values()].find((m) => m.pool === "main")!;
    await env.DB.prepare("INSERT INTO batches (meal_slug, portions, cooked_weight_g, portion_g, created_on, portions_left) VALUES (?, 4, 1000, 250, '2026-10-26', 4)").bind(meal.slug).run();
    const res = await processPush(env.DB, { clientId: "phone-meal", mutations: [{ id: 1, name: "logMeal", args: { clientId: "meal-1", date: "2026-10-27", slot: "lunch", mealSlug: meal.slug } }] }, now);
    expect(res.rejected).toEqual([]);
    expect(await env.DB.prepare("SELECT kcal, protein_g, category FROM meal_logs WHERE client_id = 'meal-1'").first()).toEqual({ kcal: meal.kcal, protein_g: meal.protein, category: "planned" });
    expect(await env.DB.prepare("SELECT portions_left FROM batches WHERE meal_slug = ? ORDER BY id DESC").bind(meal.slug).first()).toEqual({ portions_left: 3 });
  });

  it("rejects a change that crashes, and moves past it", async () => {
    const crash = async () => {
      throw new TypeError("boom");
    };
    const res = await processPush(env.DB, { clientId: "phone-crash", mutations: [{ id: 1, name: "setVoice", args: { voice: "plain" } }] }, now, crash);
    expect(res).toEqual({ lastMutationId: 1, rejected: [{ id: 1, message: "Something went wrong saving it." }] });
  });

  it("retries, not rejects, when the database fails mid-change", async () => {
    const outage = async () => {
      throw new StorageError("D1 unavailable");
    };
    await expect(processPush(env.DB, { clientId: "phone-outage", mutations: [{ id: 1, name: "setVoice", args: { voice: "plain" } }] }, now, outage)).rejects.toThrow("D1 unavailable");
    expect(await env.DB.prepare("SELECT last_mutation_id FROM sync_clients WHERE client_id = 'phone-outage'").first()).toBeNull();
  });

  it("logs a set against a workout made in the same push, filling in the server's id", async () => {
    const at = now.toISOString();
    const exercise = plan.templates["wed-legs-shoulders"]!.exercises[0].exercise;
    const res = await processPush(
      env.DB,
      {
        clientId: "phone-gym",
        mutations: [
          { id: 1, name: "planWorkout", args: { clientId: "w-push", date: "2026-10-27", templateId: "wed-legs-shoulders", at } },
          { id: 2, name: "logSet", args: { clientId: "s-push", workout: "w-push", position: 0, exercise, setNumber: 1, weightLb: 280, reps: 11, at } },
        ],
      },
      now,
    );
    expect(res.rejected).toEqual([]);
    const w = await env.DB.prepare("SELECT id, started_at, planned_at FROM workout_sessions WHERE client_id = 'w-push'").first<{ id: number; started_at: string; planned_at: string }>();
    expect(w).toMatchObject({ started_at: at, planned_at: at });
    expect(await env.DB.prepare("SELECT session_id, session_key FROM set_logs WHERE client_id = 's-push'").first()).toEqual({ session_id: w!.id, session_key: "w-push" });
  });

  it("edits a v1 set that has no client id", async () => {
    const session = await env.DB.prepare("INSERT INTO workout_sessions (date, template_id, started_at) VALUES ('2026-10-26', 'mon-chest-back-arms', '2026-10-26T17:00:00Z') RETURNING id").first<{ id: number }>();
    const set = await env.DB.prepare("INSERT INTO set_logs (session_id, session_key, exercise_id, position, set_number, weight_lb, reps, logged_at) VALUES (?, ?, 'leg-press', 0, 1, 100, 8, '2026-10-26T17:05:00Z') RETURNING id")
      .bind(session!.id, `id:${session!.id}`)
      .first<{ id: number }>();
    const res = await processPush(env.DB, { clientId: "phone-edit", mutations: [{ id: 1, name: "editSet", args: { key: `id:${set!.id}`, weightLb: 105, reps: 8 } }] }, now);
    expect(res.rejected).toEqual([]);
    expect(await env.DB.prepare("SELECT count(*) AS n, max(weight_lb) AS w FROM set_logs WHERE session_id = ?").bind(session!.id).first()).toEqual({ n: 1, w: 105 });
  });
});
