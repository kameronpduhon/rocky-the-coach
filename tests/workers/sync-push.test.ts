import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { meals, plan } from "~/content";
import { addDays } from "~/domain/dates";
import { processPush } from "~/sync/push.server";
import { StorageError } from "~/sync/server-tx.server";

const now = new Date("2026-10-27T16:00:00Z");
const plannedWeek = async (monday: string) =>
  (
    await env.DB.prepare("SELECT date, slot, meal_slug, swapped FROM planned_meals WHERE date BETWEEN ? AND ? ORDER BY date, slot")
      .bind(monday, addDays(monday, 6))
      .all<{ date: string; slot: string; meal_slug: string; swapped: number }>()
  ).results;

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

  // November dates, so nothing the other push tests logged in October is already in the way.
  it("starts a batch from the phone, numbers it, and eats from it the same day", async () => {
    const tue = new Date("2026-11-03T18:00:00Z");
    const res = await processPush(
      env.DB,
      {
        clientId: "phone-batch",
        mutations: [
          { id: 1, name: "startBatch", args: { clientId: "b-push", date: "2026-11-03", slot: "lunch", mealSlug: "chicken-and-rice-bowl", portions: 3, cookedWeightG: 495 } },
          { id: 2, name: "logMeal", args: { clientId: "m-push", date: "2026-11-03", slot: "lunch", mealSlug: "chicken-and-rice-bowl" } },
        ],
      },
      tue,
    );
    expect(res.rejected).toEqual([]);
    const batch = await env.DB.prepare("SELECT id, portion_g, portions_left, factor FROM batches WHERE client_id = 'b-push'").first<{ id: number }>();
    expect(batch).toMatchObject({ portion_g: 165, portions_left: 2, factor: 1 });
    expect(batch!.id).toBeGreaterThan(0);
    expect(await env.DB.prepare("SELECT meal_slug, swapped FROM planned_meals WHERE date = '2026-11-04' AND slot = 'lunch'").first()).toEqual({ meal_slug: "chicken-and-rice-bowl", swapped: 1 });
  });

  it("logs a seeded usual order and counts the use", async () => {
    const res = await processPush(env.DB, { clientId: "phone-usual", mutations: [{ id: 1, name: "logUsual", args: { clientId: "o-push", usual: "usual-ranch-water", date: "2026-10-27" } }] }, now);
    expect(res.rejected).toEqual([]);
    expect(await env.DB.prepare("SELECT name, kcal, category FROM meal_logs WHERE client_id = 'o-push'").first()).toEqual({ name: "Ranch Water", kcal: 100, category: "drink" });
    expect(await env.DB.prepare("SELECT uses FROM usual_orders WHERE client_id = 'usual-ranch-water'").first()).toEqual({ uses: 1 });
  });

  it("closes out a day on the server, skipping what the phone skipped", async () => {
    const res = await processPush(
      env.DB,
      {
        clientId: "phone-close",
        mutations: [{ id: 1, name: "closeOutDay", args: { date: "2026-11-09", eaten: [{ clientId: "c-push-1", slot: "dinner", mealSlug: "honey-glazed-chicken-thighs" }], skipped: [{ clientId: "c-push-2", slot: "dessert", mealSlug: "protein-ice-cream" }] } }],
      },
      new Date("2026-11-10T18:00:00Z"),
    );
    expect(res.rejected).toEqual([]);
    expect((await env.DB.prepare("SELECT slot, category, kcal FROM meal_logs WHERE client_id LIKE 'c-push-%' ORDER BY slot").all()).results).toEqual([
      { slot: "dessert", category: "skipped", kcal: 0 },
      { slot: "dinner", category: "planned", kcal: meals.get("honey-glazed-chicken-thighs")!.kcal },
    ]);
  });

  // Weeks no other test here generates. Nov 16 and Nov 23 are Mondays, and each push lands on that Monday at noon.
  it("generates the week before an offline swap lands in it, so the other days keep their plan", async () => {
    const monday = "2026-11-16";
    const res = await processPush(
      env.DB,
      { clientId: "phone-week-swap", mutations: [{ id: 1, name: "swapMeal", args: { date: monday, slot: "dinner", mealSlug: "steak-and-baked-potato", always: false } }] },
      new Date("2026-11-16T18:00:00Z"),
    );
    expect(res.rejected).toEqual([]);
    const week = await plannedWeek(monday);
    expect(week).toHaveLength(35);
    expect(week.filter((r) => r.swapped === 1)).toEqual([{ date: monday, slot: "dinner", meal_slug: "steak-and-baked-potato", swapped: 1 }]);
  });

  it("generates the week before an offline batch plans its later days", async () => {
    const monday = "2026-11-23";
    const res = await processPush(
      env.DB,
      {
        clientId: "phone-week-batch",
        mutations: [{ id: 1, name: "startBatch", args: { clientId: "b-week", date: monday, slot: "lunch", mealSlug: "chicken-and-rice-bowl", portions: 3, cookedWeightG: 495 } }],
      },
      new Date("2026-11-23T18:00:00Z"),
    );
    expect(res.rejected).toEqual([]);
    const week = await plannedWeek(monday);
    expect(week).toHaveLength(35);
    expect(week.filter((r) => r.swapped === 1).map((r) => [r.date, r.slot, r.meal_slug])).toEqual([
      ["2026-11-24", "lunch", "chicken-and-rice-bowl"],
      ["2026-11-25", "lunch", "chicken-and-rice-bowl"],
    ]);
  });
});
