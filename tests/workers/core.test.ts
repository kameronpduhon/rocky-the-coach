import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("core database", () => {
  it("seeds the household with Kameron and Catherine", async () => {
    const { results } = await env.CORE.prepare("select name, name_key, db_binding, plan_key, password_hash from users order by id").all();
    expect(results).toEqual([
      { name: "Kameron", name_key: "kameron", db_binding: "DB", plan_key: "kameron", password_hash: null },
      { name: "Catherine", name_key: "catherine", db_binding: "DB_CATHERINE", plan_key: null, password_hash: null },
    ]);
  });

  it("gives Catherine an empty person database with the full schema", async () => {
    const row = await env.DB_CATHERINE.prepare("select count(*) as n from weigh_ins").first<{ n: number }>();
    expect(row?.n).toBe(0);
  });
});
