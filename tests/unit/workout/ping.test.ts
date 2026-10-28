import { describe, expect, it } from "vitest";
import { cancelPing, pingBody, schedulePing } from "~/workout/ping";

function fake(reply: () => Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const send = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return reply();
  }) as unknown as typeof fetch;
  return { calls, send };
}

describe("rest ping calls", () => {
  it("posts the rest length and the message, clamped to what the server takes", async () => {
    const f = fake(async () => new Response(null, { status: 204 }));
    expect(await schedulePing(150.4, pingBody("Leg press", 2), f.send)).toBe(true);
    expect(f.calls[0]).toMatchObject({ url: "/api/rest", init: { method: "POST" } });
    expect(JSON.parse(String(f.calls[0].init!.body))).toEqual({ seconds: 150, title: "Rest's up", body: "Set 2 of Leg press." });
    await schedulePing(0.2, "x", f.send);
    expect(JSON.parse(String(f.calls[1].init!.body)).seconds).toBe(1);
  });

  it("cancels with DELETE", async () => {
    const f = fake(async () => new Response(null, { status: 204 }));
    expect(await cancelPing(f.send)).toBe(true);
    expect(f.calls[0]).toMatchObject({ url: "/api/rest", init: { method: "DELETE" } });
  });

  it("says false with no signal or a refused call, and never throws", async () => {
    expect(await schedulePing(90, "x", fake(async () => Promise.reject(new TypeError("Failed to fetch"))).send)).toBe(false);
    expect(await cancelPing(fake(async () => new Response(null, { status: 401 })).send)).toBe(false);
  });
});
