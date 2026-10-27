import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { logWeighIn, deleteWeighIn } from "~/server/body.server";
import { processPull } from "~/sync/pull.server";
import { processPush } from "~/sync/push.server";
import { db } from "./helpers";

describe("pull", () => {
  it("returns a full snapshot from version 0", async () => {
    await logWeighIn(db(), "2026-10-20", 206, new Date());
    const res = await processPull(env.DB, 0, "phone-a");
    expect(res.snapshot).toBe(true);
    expect(res.puts.weigh_ins).toEqual([expect.objectContaining({ date: "2026-10-20", weight_lb: 206 })]);
    expect(res.version).toBeGreaterThan(0);
  });

  it("returns only what changed after a version, including deletes", async () => {
    const start = (await processPull(env.DB, 0, "phone-a")).version;
    await logWeighIn(db(), "2026-10-21", 205.5, new Date());
    await deleteWeighIn(db(), "2026-10-20");
    const res = await processPull(env.DB, start, "phone-a");
    expect(res.snapshot).toBe(false);
    expect(res.puts.weigh_ins).toEqual([expect.objectContaining({ date: "2026-10-21" })]);
    expect(res.dels.weigh_ins).toEqual(["2026-10-20"]);
    expect(res.puts.meal_logs).toBeUndefined();
  });

  it("tells the phone the last change it applied", async () => {
    await processPush(env.DB, { clientId: "phone-z", mutations: [{ id: 4, name: "setVoice", args: { voice: "plain" } }] }, new Date());
    expect((await processPull(env.DB, 0, "phone-z")).lastMutationId).toBe(4);
  });

  it("falls back to a snapshot when the log no longer reaches back far enough", async () => {
    await logWeighIn(db(), "2026-10-22", 205, new Date());
    const { version } = await processPull(env.DB, 0, "phone-a");
    await env.DB.prepare("delete from changes where version <= ?").bind(version).run();
    await logWeighIn(db(), "2026-10-23", 204.8, new Date());
    expect((await processPull(env.DB, 1, "phone-a")).snapshot).toBe(true);
  });

  it("only ever reads the database it is given", async () => {
    await logWeighIn(db(), "2026-10-24", 204.6, new Date());
    const res = await processPull(env.DB_CATHERINE, 0, "phone-c");
    expect(res.puts.weigh_ins ?? []).toEqual([]);
  });
});
