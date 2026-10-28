import { afterEach, describe, expect, it, vi } from "vitest";
import { describeMeal } from "~/ai/client";

afterEach(() => vi.unstubAllGlobals());

const answer = (body: unknown, status = 200) => vi.fn(async (_url: string, _init?: RequestInit) => Response.json(body, { status }));
const PLATE = { name: "Chipotle bowl", category: "meal", items: [{ label: "Black beans", foodId: "black-beans-cooked", grams: 120 }] };

describe("describeMeal", () => {
  it("posts the text and returns the model's foods", async () => {
    const fetch = answer(PLATE);
    vi.stubGlobal("fetch", fetch);
    expect(await describeMeal("Chipotle bowl, black beans")).toEqual(PLATE);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("/api/ai/describe");
    expect(JSON.parse(String(init!.body))).toEqual({ text: "Chipotle bowl, black beans" });
  });

  it("is null on a fallback, a cap, a timeout, or a reply with numbers it shouldn't have", async () => {
    vi.stubGlobal("fetch", answer({ items: null }));
    expect(await describeMeal("x")).toBeNull();
    vi.stubGlobal("fetch", answer({ fallback: "cap" }, 429));
    expect(await describeMeal("x")).toBeNull();
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)))));
    expect(await describeMeal("x", 20)).toBeNull();
  });
});
