import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { localDate } from "~/domain/dates";
import { action } from "~/routes/api.ingest.steps";
import { stepsFor } from "~/server/body.server";
import { db, routeArgs, setIngestToken } from "./helpers";

const req = (body: unknown, token = "test-ingest-token") =>
  new Request("http://localhost/api/ingest/steps", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("steps ingest", () => {
  it("rejects a bad token", async () => {
    const res = (await action(routeArgs(req({ date: localDate(), steps: 100 }, "nope")))) as Response;
    expect(res.status).toBe(401);
  });

  it("upserts today's steps", async () => {
    const res = (await action(routeArgs(req({ date: localDate(), steps: 4321 })))) as Response;
    expect(res.status).toBe(200);
    expect(await stepsFor(db(), localDate())).toBe(4321);
  });

  it("accepts steps sent as a string with decimals", async () => {
    await action(routeArgs(req({ date: localDate(), steps: "5,012.0" })));
    expect(await stepsFor(db(), localDate())).toBe(5012);
  });

  it("rejects dates far from today and silly counts", async () => {
    expect(((await action(routeArgs(req({ date: "2020-01-01", steps: 10 })))) as Response).status).toBe(400);
    expect(((await action(routeArgs(req({ date: localDate(), steps: 500000 })))) as Response).status).toBe(400);
    expect(((await action(routeArgs(req({ date: localDate(), steps: "" })))) as Response).status).toBe(400);
  });

  it("writes Catherine's steps to her own database", async () => {
    await setIngestToken("catherine", "cat-token");
    const res = (await action(routeArgs(req({ date: localDate(), steps: 6100 }, "cat-token")))) as Response;
    expect(res.status).toBe(200);
    expect(await env.DB_CATHERINE.prepare("select steps from steps_daily where date = ?").bind(localDate()).first()).toEqual({ steps: 6100 });
    expect(await env.DB.prepare("select count(*) as n from steps_daily where steps = 6100").first()).toEqual({ n: 0 });
  });

  it("writes to Kameron's database with his own token", async () => {
    await setIngestToken("kameron", "kam-token");
    await action(routeArgs(req({ date: localDate(), steps: 7300 }, "kam-token")));
    expect(await stepsFor(db(), localDate())).toBe(7300);
  });
});
