import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authenticate } from "~/server/auth.server";
import { currentUser, runAsUser, userDb } from "~/server/current-user.server";
import { commitSession, getSession } from "~/server/session.server";
import { logWeighIn } from "~/server/body.server";
import { userById } from "~/server/users.server";

async function cookieWith(values: Record<string, unknown>): Promise<string> {
  const session = await getSession();
  for (const [k, v] of Object.entries(values)) session.set(k as never, v as never);
  return (await commitSession(session)).split(";")[0];
}

describe("authenticate", () => {
  it("is null when signed out, on any path", async () => {
    expect(await authenticate(new Request("http://localhost/plan"))).toBeNull();
    expect(await authenticate(new Request("http://localhost/api/sync/pull?since=0&clientId=abcdefgh"))).toBeNull();
  });

  it("resolves the user in the session", async () => {
    const auth = await authenticate(new Request("http://localhost/", { headers: { Cookie: await cookieWith({ userId: 2 }) } }));
    expect(auth?.user.name).toBe("Catherine");
    expect(auth?.setCookie).toBeUndefined();
  });

  it("upgrades a v1 cookie to Kameron without signing him out", async () => {
    const auth = await authenticate(new Request("http://localhost/", { headers: { Cookie: await cookieWith({ signedIn: true }) } }));
    expect(auth?.user.name).toBe("Kameron");
    const upgraded = await getSession(auth!.setCookie!.split(";")[0]);
    expect(upgraded.get("userId")).toBe(1);
    expect(upgraded.get("signedIn")).toBeUndefined();
  });

  it("is null for a user id that no longer exists", async () => {
    expect(await authenticate(new Request("http://localhost/", { headers: { Cookie: await cookieWith({ userId: 99 }) } }))).toBeNull();
  });
});

describe("request scope", () => {
  it("points userDb at the signed-in person's own database", async () => {
    const catherine = (await userById(2))!;
    await runAsUser(catherine, async () => {
      expect(currentUser().name).toBe("Catherine");
      await logWeighIn(userDb(), "2026-10-26", 139.8, new Date());
    });
    expect(await env.DB_CATHERINE.prepare("select count(*) as n from weigh_ins where date = '2026-10-26'").first()).toEqual({ n: 1 });
    expect(await env.DB.prepare("select count(*) as n from weigh_ins where date = '2026-10-26'").first()).toEqual({ n: 0 });
  });
});
