import { describe, expect, it } from "vitest";
import { signIn } from "~/lib/sign-in";

describe("signIn", () => {
  it("posts the name and password as JSON, and null means signed in", async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const send = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    expect(await signIn("Kameron", "pw", send)).toBeNull();
    expect(sent!.url).toBe("/api/login");
    expect(sent!.init.method).toBe("POST");
    expect(JSON.parse(String(sent!.init.body))).toEqual({ name: "Kameron", password: "pw" });
  });

  it("shows the server's line for a wrong password and a lockout", async () => {
    const reply = (status: number, error: string) => (async () => Response.json({ error }, { status })) as unknown as typeof fetch;
    expect(await signIn("k", "x", reply(401, "That name and password don't match."))).toBe("That name and password don't match.");
    expect(await signIn("k", "x", reply(429, "Too many tries. Wait 15 minutes."))).toBe("Too many tries. Wait 15 minutes.");
  });

  it("says when there is no signal, or the server gave no line", async () => {
    const noSignal = (async () => {
      throw new TypeError("Load failed");
    }) as unknown as typeof fetch;
    expect(await signIn("k", "x", noSignal)).toBe("Signing in needs a signal.");
    expect(await signIn("k", "x", (async () => new Response("oops", { status: 500 })) as unknown as typeof fetch)).toBe("That didn't work. Try again.");
  });
});
