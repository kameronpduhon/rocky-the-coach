import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { processPush } from "~/sync/push.server";

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
});
