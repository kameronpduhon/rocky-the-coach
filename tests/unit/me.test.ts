import { describe, expect, it } from "vitest";
import { isPlanOnly, loadMe, type Me } from "~/me";

const KAMERON: Me = { userId: 1, name: "Kameron", hasPlan: true };

function memory(seed?: Me) {
  const store = new Map<string, string>(seed ? [["rocky-layout", JSON.stringify(seed)]] : []);
  return { store, storage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } };
}
const answer = (res: Response) => (async () => res) as unknown as typeof fetch;
const noSignal = (async () => {
  throw new TypeError("Load failed");
}) as unknown as typeof fetch;

describe("loadMe", () => {
  it("returns the server's answer and saves it for offline", async () => {
    const { store, storage } = memory();
    expect(await loadMe(answer(Response.json(KAMERON)), storage)).toEqual(KAMERON);
    expect(JSON.parse(store.get("rocky-layout")!)).toEqual(KAMERON);
  });

  it("sends a signed-out person to sign in, even with a saved copy", async () => {
    const thrown = await loadMe(answer(new Response(null, { status: 401 })), memory(KAMERON).storage).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
    expect((thrown as Response).headers.get("Location")).toBe("/login");
  });

  it("uses the saved copy with no signal or a server error", async () => {
    expect(await loadMe(noSignal, memory(KAMERON).storage)).toEqual(KAMERON);
    expect(await loadMe(answer(new Response(null, { status: 503 })), memory(KAMERON).storage)).toEqual(KAMERON);
  });

  it("fails with no signal and nothing saved", async () => {
    await expect(loadMe(noSignal, memory().storage)).rejects.toThrow("hasn't signed in");
  });

  it("still answers when storage is blocked", async () => {
    expect(await loadMe(answer(Response.json(KAMERON)), null)).toEqual(KAMERON);
  });
});

describe("isPlanOnly", () => {
  it("covers the screens that need a plan", () => {
    for (const path of ["/plan", "/progress", "/progress/lifts", "/workout", "/meal/chicken-and-rice-bowl", "/check-in", "/groceries"]) expect(isPlanOnly(path), path).toBe(true);
  });

  it("leaves Today, Library, the lift page and Settings open", () => {
    for (const path of ["/", "/library", "/lift/12", "/settings", "/planner"]) expect(isPlanOnly(path), path).toBe(false);
  });
});
