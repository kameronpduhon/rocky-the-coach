import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { commitSession, getSession } from "~/server/session.server";
import { routeApi } from "../../workers/api/router";
import { api, CATHERINE, KAMERON, postJson, setPassword } from "./helpers";

describe("GET /api/me", () => {
  it("is a 401 with JSON when signed out, never a redirect", async () => {
    const res = await api("/api/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Signed out" });
  });

  it("names each signed-in person and whether they have a plan", async () => {
    expect(await (await api("/api/me", {}, KAMERON)).json()).toEqual({ userId: 1, name: "Kameron", hasPlan: true });
    expect(await (await api("/api/me", {}, CATHERINE)).json()).toEqual({ userId: 2, name: "Catherine", hasPlan: false });
  });

  it("is never cached", async () => {
    expect((await api("/api/me", {}, KAMERON)).headers.get("Cache-Control")).toBe("no-store");
  });

  it("upgrades a v1 cookie to Kameron and sends the new cookie back", async () => {
    const v1 = await getSession();
    v1.set("signedIn", true);
    const cookie = (await commitSession(v1)).split(";")[0];
    const res = await api("/api/me", { headers: { Cookie: cookie } });
    expect(await res.json()).toMatchObject({ userId: 1 });
    const upgraded = await getSession(res.headers.get("Set-Cookie")!.split(";")[0]);
    expect(upgraded.get("userId")).toBe(1);
  });

  it("answers a wrong method with 405", async () => {
    expect((await api("/api/me", { method: "POST" }, KAMERON)).status).toBe(405);
  });
});

describe("routeApi", () => {
  it("passes on paths it doesn't own, so React Router still answers them", async () => {
    expect(await routeApi(new Request("http://localhost/plan"))).toBeNull();
    expect(await routeApi(new Request("http://localhost/"))).toBeNull();
  });
});

const signIn = (name: string, password: string, ip: string) =>
  api("/api/login", { ...postJson({ name, password }), headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip } });

describe("POST /api/login", () => {
  it("signs Catherine in to her own account with a 400-day cookie", async () => {
    await setPassword("catherine", "pw-catherine");
    const res = await signIn("Catherine", "pw-catherine", "198.51.100.1");
    expect(res.status).toBe(204);
    const cookie = res.headers.get("Set-Cookie")!;
    expect(cookie).toMatch(/Max-Age=34560000/);
    expect(await (await api("/api/me", { headers: { Cookie: cookie.split(";")[0] } })).json()).toMatchObject({ userId: 2 });
  });

  it("gives the same 401 for a wrong password and an unknown name", async () => {
    await setPassword("kameron", "pw-kameron");
    const wrong = await signIn("Kameron", "nope", "198.51.100.2");
    const unknown = await signIn("Nobody", "pw-kameron", "198.51.100.2");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: "That name and password don't match." });
    expect(await unknown.json()).toEqual({ error: "That name and password don't match." });
    expect(wrong.headers.get("Set-Cookie")).toBeNull();
  });

  it("locks an IP out after 5 failures, even with the right password", async () => {
    await setPassword("kameron", "pw-kameron");
    for (let i = 0; i < 5; i++) await signIn("kameron", "wrong", "192.0.2.50");
    const locked = await signIn("kameron", "pw-kameron", "192.0.2.50");
    expect(locked.status).toBe(429);
    expect(await locked.json()).toEqual({ error: "Too many tries. Wait 15 minutes." });
    expect(await env.CORE.prepare("select count(*) as n from login_attempts where ip = ?").bind("192.0.2.50").first()).toEqual({ n: 5 });
  });

  it("treats a body that isn't JSON as a failed try", async () => {
    const res = await api("/api/login", { method: "POST", body: "name=kameron", headers: { "CF-Connecting-IP": "198.51.100.3" } });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/logout", () => {
  it("clears the session cookie", async () => {
    const res = await api("/api/logout", { method: "POST" }, KAMERON);
    expect(res.status).toBe(204);
    const cleared = res.headers.get("Set-Cookie")!;
    expect(cleared).toMatch(/^__rocky=;/);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
  });

  it("works signed out too", async () => {
    expect((await api("/api/logout", { method: "POST" })).status).toBe(204);
  });
});
