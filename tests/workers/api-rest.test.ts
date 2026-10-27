import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { action } from "~/routes/api.rest";
import { routeArgs } from "./helpers";

const kameronTimer = () => env.REST_TIMER.get(env.REST_TIMER.idFromName("DB"));
const call = (method: string, body?: unknown) =>
  action(routeArgs(new Request("http://localhost/api/rest", { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })));

describe("/api/rest", () => {
  it("schedules the signed-in person's ping, and DELETE cancels it", async () => {
    const res = await call("POST", { seconds: 150, title: "Rest's up", body: "Set 2 of leg press" });
    expect(res.status).toBe(204);
    expect(await runInDurableObject(kameronTimer(), (_o, state) => state.storage.getAlarm())).not.toBeNull();
    expect((await call("DELETE")).status).toBe(204);
    expect(await runInDurableObject(kameronTimer(), (_o, state) => state.storage.getAlarm())).toBeNull();
  });

  it("refuses a bad body", async () => {
    expect((await call("POST", { seconds: 0, title: "", body: "" })).status).toBe(400);
    expect((await call("POST", { seconds: 5000, title: "x", body: "" })).status).toBe(400);
  });
});
