import { describe, expect, it } from "vitest";
import { commitSession, getSession } from "~/server/session.server";
import { routeApi } from "../../workers/api/router";
import { api, CATHERINE, KAMERON } from "./helpers";

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
