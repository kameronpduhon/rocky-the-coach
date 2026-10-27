import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { logWeighIn, deleteWeighIn } from "~/server/body.server";
import { logOffPlan } from "~/server/meals.server";
import { db } from "./helpers";

const changes = async () =>
  (await env.DB.prepare("select table_name, row_key, op from changes order by version").all()).results;

describe("sync triggers", () => {
  it("logs puts and deletes made by v1 server code", async () => {
    await logWeighIn(db(), "2026-10-27", 205.1, new Date());
    await logWeighIn(db(), "2026-10-27", 204.9, new Date());
    await deleteWeighIn(db(), "2026-10-27");
    expect(await changes()).toEqual([
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
});
