import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setSwitch } from "./fake-ai";
import { api, KAMERON } from "./helpers";

afterEach(() => vi.restoreAllMocks());

const product = (code: string, nutriments: Record<string, number>, extra: Record<string, unknown> = {}) =>
  Response.json({ code, status: 1, status_verbose: "product found", product: { product_name: "HIGH PROTEIN MILK SHAKE", brands: "fa!rlife CORE POWER", serving_size: "1 bottle (414 g)", serving_quantity: 414, categories_tags: ["en:beverages"], nutriments, ...extra } });

describe("GET /api/food/barcode/:code", () => {
  it("needs a session", async () => {
    expect((await api("/api/food/barcode/811620021982")).status).toBe(401);
  });

  it("refuses a code with a bad check digit without asking Open Food Facts", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const res = await api("/api/food/barcode/036000291453", {}, KAMERON);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Not a barcode" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("parses a found product, then serves the second ask from the cache", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => product("0811620021982", { "energy-kcal_serving": 170, proteins_serving: 26 }));
    const first = await api("/api/food/barcode/811620021982", {}, KAMERON);
    expect(first.headers.get("Cache-Control")).toBe("no-store");
    expect(await first.json()).toEqual({
      found: true,
      product: { code: "0811620021982", name: "fa!rlife CORE POWER HIGH PROTEIN MILK SHAKE", servingText: "1 bottle (414 g)", kcal: 170, proteinG: 26, drink: true },
    });
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toBe("https://world.openfoodfacts.org/api/v2/product/0811620021982?fields=code,product_name,brands,serving_size,serving_quantity,nutriments,categories_tags");
    expect(new Headers((init as RequestInit).headers).get("User-Agent")).toBe("TheCorner/2.0 (https://kampduh.com)");

    const second = await api("/api/food/barcode/0811620021982", {}, KAMERON);
    expect((await second.json()) as { found: boolean }).toMatchObject({ found: true });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("caches a miss too", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ code: "0036000291452", status: 0, status_verbose: "product not found" }, { status: 404 }));
    expect(await (await api("/api/food/barcode/036000291452", {}, KAMERON)).json()).toEqual({ found: false });
    expect(await (await api("/api/food/barcode/036000291452", {}, KAMERON)).json()).toEqual({ found: false });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("says Open Food Facts is down, and caches nothing for it", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection reset"));
    expect(await (await api("/api/food/barcode/4006381333931", {}, KAMERON)).json()).toEqual({ found: false, down: true });
    spy.mockImplementation(async () => Response.json({ status: 1, product: { product_name: "Pen", nutriments: { "energy-kcal_100g": 10 } } }));
    expect(await (await api("/api/food/barcode/4006381333931", {}, KAMERON)).json()).toMatchObject({ found: true });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("treats a 5xx from Open Food Facts as down", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("busy", { status: 503 }));
    expect(await (await api("/api/food/barcode/10012345678902", {}, KAMERON)).json()).toEqual({ found: false, down: true });
  });

  it("works with the AI switched off, since a barcode is not AI", async () => {
    await setSwitch(env.DB, false);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => product("96385074", { "energy-kcal_100g": 50, proteins_100g: 1 }));
    const res = await api("/api/food/barcode/96385074", {}, KAMERON);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ found: true, product: { kcal: 207, proteinG: 4.1 } });
  });
});
