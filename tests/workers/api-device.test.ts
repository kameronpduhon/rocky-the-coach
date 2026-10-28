import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { localDate } from "~/domain/dates";
import { stepsFor } from "~/server/body.server";
import { api, CATHERINE, db, KAMERON, postJson, setIngestToken } from "./helpers";

describe("POST /api/vitals", () => {
  it("stores a tap latency in the signed-in person's database", async () => {
    const res = await api("/api/vitals", postJson({ route: "/", inp: 72, target: "button.btn-prominent" }), KAMERON);
    expect(res.status).toBe(204);
    expect(await env.DB.prepare("select route, inp_ms, target from vitals").first()).toEqual({ route: "/", inp_ms: 72, target: "button.btn-prominent" });
  });

  it("writes Catherine's to hers", async () => {
    await api("/api/vitals", postJson({ route: "/library", inp: 40 }), CATHERINE);
    expect(await env.DB_CATHERINE.prepare("select count(*) as n from vitals where inp_ms = 40").first()).toEqual({ n: 1 });
    expect(await env.DB.prepare("select count(*) as n from vitals where inp_ms = 40").first()).toEqual({ n: 0 });
  });

  it("ignores junk and is a 401 signed out", async () => {
    expect((await api("/api/vitals", postJson({ route: "/", inp: -1 }), KAMERON)).status).toBe(400);
    expect((await api("/api/vitals", postJson("nope"), KAMERON)).status).toBe(400);
    expect((await api("/api/vitals", postJson({ route: "/", inp: 72 }))).status).toBe(401);
  });
});

describe("POST /api/push/subscribe", () => {
  const sub = { endpoint: "https://web.push.apple.com/cat-1", keys: { p256dh: "p256dh-key", auth: "auth-key" } };

  it("saves the device to the signed-in person's database", async () => {
    expect(await (await api("/api/push/subscribe", postJson(sub), CATHERINE)).json()).toEqual({ ok: true });
    expect(await env.DB_CATHERINE.prepare("select endpoint from push_subscriptions").first()).toEqual({ endpoint: "https://web.push.apple.com/cat-1" });
    expect(await env.DB.prepare("select count(*) as n from push_subscriptions").first()).toEqual({ n: 0 });
  });

  it("refuses a subscription that isn't https", async () => {
    expect((await api("/api/push/subscribe", postJson({ ...sub, endpoint: "http://x" }), KAMERON)).status).toBe(400);
  });
});

describe("/api/rest", () => {
  const timer = (binding: string) => env.REST_TIMER.get(env.REST_TIMER.idFromName(binding));
  const alarm = (binding: string) => runInDurableObject(timer(binding), (_o, state) => state.storage.getAlarm());

  it("schedules the signed-in person's ping, and DELETE cancels it", async () => {
    const res = await api("/api/rest", postJson({ seconds: 150, title: "Rest's up", body: "Set 2 of leg press" }), KAMERON);
    expect(res.status).toBe(204);
    expect(await alarm("DB")).not.toBeNull();
    expect((await api("/api/rest", { method: "DELETE" }, KAMERON)).status).toBe(204);
    expect(await alarm("DB")).toBeNull();
  });

  it("uses Catherine's own timer", async () => {
    await api("/api/rest", postJson({ seconds: 90, title: "Rest's up", body: "" }), CATHERINE);
    expect(await alarm("DB_CATHERINE")).not.toBeNull();
    expect(await alarm("DB")).toBeNull();
  });

  it("refuses a bad body", async () => {
    expect((await api("/api/rest", postJson({ seconds: 0, title: "", body: "" }), KAMERON)).status).toBe(400);
    expect((await api("/api/rest", postJson({ seconds: 5000, title: "x", body: "" }), KAMERON)).status).toBe(400);
  });
});

describe("POST /api/ingest/steps", () => {
  const send = (body: unknown, token = "test-ingest-token") =>
    api("/api/ingest/steps", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("needs no session, only its token", async () => {
    expect((await send({ date: localDate(), steps: 100 }, "nope")).status).toBe(401);
    expect((await send({ date: localDate(), steps: 4321 })).status).toBe(200);
    expect(await stepsFor(db(), localDate())).toBe(4321);
  });

  it("accepts steps sent as a string with decimals", async () => {
    await send({ date: localDate(), steps: "5,012.0" });
    expect(await stepsFor(db(), localDate())).toBe(5012);
  });

  it("rejects dates far from today and silly counts", async () => {
    expect((await send({ date: "2020-01-01", steps: 10 })).status).toBe(400);
    expect((await send({ date: localDate(), steps: 500000 })).status).toBe(400);
    expect((await send({ date: localDate(), steps: "" })).status).toBe(400);
  });

  it("writes Catherine's steps to her own database", async () => {
    await setIngestToken("catherine", "cat-token");
    expect((await send({ date: localDate(), steps: 6100 }, "cat-token")).status).toBe(200);
    expect(await env.DB_CATHERINE.prepare("select steps from steps_daily where date = ?").bind(localDate()).first()).toEqual({ steps: 6100 });
    expect(await env.DB.prepare("select count(*) as n from steps_daily where steps = 6100").first()).toEqual({ n: 0 });
  });

  it("writes to Kameron's database with his own token", async () => {
    await setIngestToken("kameron", "kam-token");
    await send({ date: localDate(), steps: 7300 }, "kam-token");
    expect(await stepsFor(db(), localDate())).toBe(7300);
  });

  it("answers a GET with 405, as before", async () => {
    expect((await api("/api/ingest/steps")).status).toBe(405);
  });
});
