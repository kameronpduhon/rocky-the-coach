import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { requireSignedIn } from "~/server/auth.server";
import { action as loginAction } from "~/routes/login";

const args = (request: Request) => ({ request, params: {}, context: {} }) as any;

function loginRequest(password: string, ip = "203.0.113.7") {
  const body = new FormData();
  body.set("password", password);
  return new Request("http://localhost/login", { method: "POST", body, headers: { "CF-Connecting-IP": ip } });
}

async function thrown(p: Promise<unknown>) {
  try {
    await p;
    return null;
  } catch (e) {
    return e as Response;
  }
}

describe("auth", () => {
  it("redirects signed-out requests to /login", async () => {
    const res = await thrown(requireSignedIn(new Request("http://localhost/plan")));
    expect(res?.status).toBe(302);
    expect(res?.headers.get("Location")).toBe("/login");
  });

  it("lets public paths through", async () => {
    expect(await thrown(requireSignedIn(new Request("http://localhost/login")))).toBeNull();
    expect(await thrown(requireSignedIn(new Request("http://localhost/login.data")))).toBeNull();
    expect(await thrown(requireSignedIn(new Request("http://localhost/api/ingest/steps", { method: "POST" })))).toBeNull();
  });

  it("rejects a wrong password", async () => {
    const res = await loginAction(args(loginRequest("nope")));
    expect((res as any).init?.status ?? (res as Response).status).toBe(401);
  });

  it("signs in with the right password and the cookie passes the guard", async () => {
    const res = (await loginAction(args(loginRequest("test-password", "198.51.100.1")))) as Response;
    expect(res.status).toBe(302);
    const setCookie = res.headers.get("Set-Cookie")!;
    expect(setCookie).toMatch(/Max-Age=34560000/);
    const cookie = setCookie.split(";")[0];
    expect(await thrown(requireSignedIn(new Request("http://localhost/plan", { headers: { Cookie: cookie } })))).toBeNull();
  });

  it("locks out an IP after 5 failed attempts in 15 minutes", async () => {
    for (let i = 0; i < 5; i++) await loginAction(args(loginRequest("wrong", "192.0.2.50")));
    const res = await loginAction(args(loginRequest("test-password", "192.0.2.50")));
    expect((res as any).init?.status ?? (res as Response).status).toBe(429);
    const { results } = await env.DB.prepare("select count(*) as n from login_attempts where ip = ?").bind("192.0.2.50").all<{ n: number }>();
    expect(results[0].n).toBe(5);
  });
});
