import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { action } from "~/routes/login";
import { authenticate } from "~/server/auth.server";
import { routeArgs, setPassword } from "./helpers";

function login(name: string, password: string, ip: string) {
  const body = new FormData();
  body.set("name", name);
  body.set("password", password);
  return new Request("http://localhost/login", { method: "POST", body, headers: { "CF-Connecting-IP": ip } });
}

const status = (res: unknown) => (res as any).init?.status ?? (res as Response).status;

describe("login", () => {
  it("signs Catherine in to her own account", async () => {
    await setPassword("catherine", "pw-catherine");
    const res = (await action(routeArgs(login("catherine", "pw-catherine", "198.51.100.1")))) as Response;
    expect(res.status).toBe(302);
    const setCookie = res.headers.get("Set-Cookie")!;
    expect(setCookie).toMatch(/Max-Age=34560000/);
    const auth = await authenticate(new Request("http://localhost/", { headers: { Cookie: setCookie.split(";")[0] } }));
    expect(auth?.user.name).toBe("Catherine");
  });

  it("gives the same answer for a wrong password and an unknown name", async () => {
    await setPassword("kameron", "pw-kameron");
    const wrong = await action(routeArgs(login("Kameron", "nope", "198.51.100.2")));
    const unknown = await action(routeArgs(login("Nobody", "pw-kameron", "198.51.100.2")));
    expect(status(wrong)).toBe(401);
    expect(status(unknown)).toBe(401);
    expect((wrong as any).data).toEqual((unknown as any).data);
  });

  it("locks an IP out after 5 failed attempts", async () => {
    await setPassword("kameron", "pw-kameron");
    for (let i = 0; i < 5; i++) await action(routeArgs(login("kameron", "wrong", "192.0.2.50")));
    expect(status(await action(routeArgs(login("kameron", "pw-kameron", "192.0.2.50"))))).toBe(429);
    expect(await env.CORE.prepare("select count(*) as n from login_attempts where ip = ?").bind("192.0.2.50").first()).toEqual({ n: 5 });
  });
});
