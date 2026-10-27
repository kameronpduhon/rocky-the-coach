import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { action } from "~/routes/api.vitals";
import { routeArgs } from "./helpers";

const beacon = (body: unknown) => new Request("http://localhost/api/vitals", { method: "POST", body: JSON.stringify(body) });

describe("vitals", () => {
  it("stores a reported tap latency", async () => {
    const res = (await action(routeArgs(beacon({ route: "/", inp: 72, target: "button.btn-prominent" })))) as Response;
    expect(res.status).toBe(204);
    expect(await env.DB.prepare("select route, inp_ms, target from vitals").first()).toEqual({ route: "/", inp_ms: 72, target: "button.btn-prominent" });
  });

  it("ignores junk", async () => {
    expect(((await action(routeArgs(beacon({ route: "/", inp: -1 })))) as Response).status).toBe(400);
    expect(((await action(routeArgs(beacon("nope")))) as Response).status).toBe(400);
  });
});
