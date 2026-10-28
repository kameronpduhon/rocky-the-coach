import { afterEach, describe, expect, it, vi } from "vitest";
import { findBarcode, readLabel } from "~/ai/client";

afterEach(() => vi.unstubAllGlobals());

const answer = (body: unknown, status = 200) => vi.fn(async (_url: string, _init?: RequestInit) => Response.json(body, { status }));
// A fetch that only ends when its signal aborts, like a server that never answers.
const hang = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason))));

const SHAKE = { code: "0811620021982", name: "fa!rlife CORE POWER HIGH PROTEIN MILK SHAKE", servingText: "1 bottle (414 g)", kcal: 170, proteinG: 26, drink: true };

describe("findBarcode", () => {
  it("returns the product", async () => {
    const fetch = answer({ found: true, product: SHAKE });
    vi.stubGlobal("fetch", fetch);
    expect(await findBarcode("811620021982")).toEqual({ found: true, product: SHAKE });
    expect(fetch.mock.calls[0]![0]).toBe("/api/food/barcode/811620021982");
  });

  it("tells a miss from Open Food Facts being down", async () => {
    vi.stubGlobal("fetch", answer({ found: false }));
    expect(await findBarcode("036000291452")).toEqual({ found: false, down: false });
    vi.stubGlobal("fetch", answer({ found: false, down: true }));
    expect(await findBarcode("036000291452")).toEqual({ found: false, down: true });
  });

  it("counts no signal, a timeout or an error as down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Load failed"))));
    expect(await findBarcode("036000291452")).toEqual({ found: false, down: true });
    vi.stubGlobal("fetch", hang);
    expect(await findBarcode("036000291452", 20)).toEqual({ found: false, down: true });
    vi.stubGlobal("fetch", answer({ error: "Signed out" }, 401));
    expect(await findBarcode("036000291452")).toEqual({ found: false, down: true });
  });
});

describe("readLabel", () => {
  const READ = { readable: true, name: "Barebells protein bar, cookies and cream", servingText: "1 bar (55 g)", servingGrams: 55, kcal: 200, proteinG: 20 };

  it("posts the photo and returns what the label says", async () => {
    const fetch = answer(READ);
    vi.stubGlobal("fetch", fetch);
    expect(await readLabel("AAAA")).toEqual(READ);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("/api/ai/label");
    expect(init!.method).toBe("POST");
    expect(JSON.parse(String(init!.body))).toEqual({ image: "AAAA" });
  });

  it("is null on a fallback, a cap, a timeout or a reply that isn't a label", async () => {
    vi.stubGlobal("fetch", answer({ fallback: "error" }));
    expect(await readLabel("AAAA")).toBeNull();
    vi.stubGlobal("fetch", answer({ fallback: "cap" }, 429));
    expect(await readLabel("AAAA")).toBeNull();
    vi.stubGlobal("fetch", hang);
    expect(await readLabel("AAAA", 20)).toBeNull();
  });
});
