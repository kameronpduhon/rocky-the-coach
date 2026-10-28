import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getDb } from "~/db/client";
import { addDays, mealDate, weekStart } from "~/domain/dates";
import { logWeighIn } from "~/server/body.server";
import { api, CATHERINE, KAMERON, postJson } from "./helpers";

const plannedThisWeek = async (d1: D1Database) => {
  const monday = weekStart(mealDate());
  return (await d1.prepare("SELECT count(*) AS n FROM planned_meals WHERE date BETWEEN ? AND ?").bind(monday, addDays(monday, 6)).first<{ n: number }>())!.n;
};
const pull = (as?: number, clientId = "phone-test-1") => api(`/api/sync/pull?since=0&clientId=${clientId}`, {}, as);

describe("GET /api/sync/pull", () => {
  it("is a 401 when signed out", async () => {
    expect((await pull()).status).toBe(401);
  });

  it("makes this week's plan for a person with one before reading, so it syncs down", async () => {
    const res = await pull(KAMERON);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    // Seven days of five slots.
    expect(await plannedThisWeek(env.DB)).toBe(35);
    const body = (await res.json()) as { snapshot: boolean; puts: { planned_meals: { date: string }[] } };
    expect(body.snapshot).toBe(true);
    const monday = weekStart(mealDate());
    expect(body.puts.planned_meals.filter((r) => r.date >= monday && r.date <= addDays(monday, 6))).toHaveLength(35);
  });

  it("plans nothing for Catherine, who has no plan", async () => {
    expect((await pull(CATHERINE)).status).toBe(200);
    expect(await plannedThisWeek(env.DB_CATHERINE)).toBe(0);
  });

  it("reads only the signed-in person's database", async () => {
    await logWeighIn(getDb(env.DB_CATHERINE), "2026-10-26", 139.8, new Date());
    const hers = (await (await pull(CATHERINE)).json()) as { puts: { weigh_ins: { date: string }[] } };
    const his = (await (await pull(KAMERON)).json()) as { puts: { weigh_ins: { date: string }[] } };
    expect(hers.puts.weigh_ins.map((r) => r.date)).toContain("2026-10-26");
    expect(his.puts.weigh_ins.map((r) => r.date)).not.toContain("2026-10-26");
  });

  it("refuses a bad pull", async () => {
    expect((await api("/api/sync/pull?since=-1&clientId=phone-test-1", {}, KAMERON)).status).toBe(400);
    expect((await api("/api/sync/pull?since=0&clientId=short", {}, KAMERON)).status).toBe(400);
  });
});

describe("POST /api/sync/push", () => {
  it("applies a change to the signed-in person's database only", async () => {
    const res = await api("/api/sync/push", postJson({ clientId: "phone-cat-1", mutations: [{ id: 1, name: "setVoice", args: { voice: "plain" } }] }), CATHERINE);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lastMutationId: 1, rejected: [] });
    expect(((await (await pull(CATHERINE, "phone-cat-1")).json()) as { lastMutationId: number }).lastMutationId).toBe(1);
    expect(((await (await pull(KAMERON, "phone-cat-1")).json()) as { lastMutationId: number }).lastMutationId).toBe(0);
  });

  it("refuses a bad body and a GET", async () => {
    expect((await api("/api/sync/push", postJson({ nope: true }), KAMERON)).status).toBe(400);
    expect((await api("/api/sync/push", {}, KAMERON)).status).toBe(405);
  });

  it("is a 401 when signed out", async () => {
    expect((await api("/api/sync/push", postJson({ clientId: "phone-x-12", mutations: [] }))).status).toBe(401);
  });
});
