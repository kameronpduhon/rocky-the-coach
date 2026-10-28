import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("the N1 migration", () => {
  it("keeps every v1 batch at factor 1, and seeds the two usual orders", async () => {
    const d1 = env.MIGRATION_TEST;
    const split = env.TEST_MIGRATIONS.findIndex((m) => m.name.startsWith("0008"));
    await applyD1Migrations(d1, env.TEST_MIGRATIONS.slice(0, split));
    await d1
      .prepare("INSERT INTO batches (id, meal_slug, portions, cooked_weight_g, portion_g, created_on, portions_left) VALUES (7, 'chicken-and-rice-bowl', 3, 495, 165, '2026-10-26', 2)")
      .run();

    await applyD1Migrations(d1, env.TEST_MIGRATIONS);

    expect(await d1.prepare("SELECT id, client_id, factor, portions_left FROM batches").all().then((r) => r.results)).toEqual([{ id: 7, client_id: null, factor: 1, portions_left: 2 }]);
    expect(await d1.prepare("SELECT client_id, kcal, relaxed, uses FROM usual_orders ORDER BY client_id").all().then((r) => r.results)).toEqual([
      { client_id: "usual-ranch-water", kcal: 100, relaxed: 0, uses: 0 },
      { client_id: "usual-restaurant-meal", kcal: 900, relaxed: 1, uses: 0 },
    ]);
  });
});
