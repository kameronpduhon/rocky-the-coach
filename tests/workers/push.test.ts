import { afterEach, describe, expect, it, vi } from "vitest";
import { pushSubscriptions } from "~/db/schema";
import { saveSubscription, sendToAll } from "~/server/push.server";
import { db } from "./helpers";

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function vapidKeys() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publicKey = b64url((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  const privateKey = ((await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey).d!;
  return { publicKey, privateKey };
}

async function browserSubscription(endpoint: string) {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  return {
    endpoint,
    keys: { p256dh: b64url((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer), auth: b64url(crypto.getRandomValues(new Uint8Array(16)).buffer) },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("push", () => {
  it("encrypts with aes128gcm and posts to each subscription", async () => {
    await saveSubscription(db(), await browserSubscription("https://web.push.apple.com/abc"));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    const sent = await sendToAll(db(), { title: "Weigh-in", body: "Step on the scale.", url: "/" }, await vapidKeys());
    expect(sent).toBe(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://web.push.apple.com/abc");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("content-encoding")).toBe("aes128gcm");
    expect(headers.get("authorization")).toMatch(/^vapid t=.+, k=.+/);
  });

  it("deletes subscriptions the push service says are gone", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 410 }));
    await sendToAll(db(), { title: "x", body: "y", url: "/" }, await vapidKeys());
    expect(await db().select().from(pushSubscriptions).all()).toHaveLength(0);
  });
});
