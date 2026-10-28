// Open Food Facts: one product by barcode, parsed into what the product card shows. The lookup and its cache are
// below; parseOff is pure.
import type { Product } from "./barcode";

const FIELDS = "code,product_name,brands,serving_size,serving_quantity,nutriments,categories_tags";
const KJ_PER_KCAL = 4.184;

/** Open Food Facts answers in 13 digits, so a UPC-A is asked for (and cached) that way too. */
export function offCode(code: string): string {
  return code.length === 12 ? `0${code}` : code;
}

export function offUrl(code: string): string {
  return `https://world.openfoodfacts.org/api/v2/product/${code}?fields=${FIELDS}`;
}

// Open Food Facts sends numbers as numbers or as numeric strings.
function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function energy(n: Record<string, unknown>, basis: "100g" | "serving"): number | undefined {
  const kcal = num(n[`energy-kcal_${basis}`]);
  if (kcal !== undefined) return kcal;
  const kj = num(n[`energy-kj_${basis}`]);
  return kj === undefined ? undefined : kj / KJ_PER_KCAL;
}

function productName(p: Record<string, unknown>): string {
  const name = typeof p.product_name === "string" ? p.product_name.trim() : "";
  const brand = typeof p.brands === "string" ? (p.brands.split(",")[0] ?? "").trim() : "";
  const full = brand && !name.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${name}`.trim() : name || brand;
  return (full || "Scanned item").slice(0, 80);
}

/** The card's product, or null when Open Food Facts has no listing or no calories for it. */
export function parseOff(code: string, json: unknown): Product | null {
  const doc = json as { status?: unknown; product?: Record<string, unknown> } | null;
  if (!doc || doc.status !== 1 || !doc.product) return null;
  const p = doc.product;
  const n = (p.nutriments ?? {}) as Record<string, unknown>;
  const kcal100 = energy(n, "100g");
  const protein100 = num(n.proteins_100g);
  const kcalServing = energy(n, "serving");
  const quantity = num(p.serving_quantity);
  const servingSize = typeof p.serving_size === "string" && p.serving_size.trim() ? p.serving_size.trim().slice(0, 40) : null;

  let kcal: number;
  let protein: number;
  let servingText: string | null;
  if (kcalServing !== undefined) {
    kcal = kcalServing;
    protein = num(n.proteins_serving) ?? (protein100 !== undefined && quantity ? (protein100 * quantity) / 100 : 0);
    servingText = servingSize ?? "1 serving";
  } else if (kcal100 !== undefined && quantity && quantity > 0) {
    kcal = (kcal100 * quantity) / 100;
    protein = ((protein100 ?? 0) * quantity) / 100;
    servingText = servingSize ?? `1 serving (${quantity} g)`;
  } else if (kcal100 !== undefined) {
    kcal = kcal100;
    protein = protein100 ?? 0;
    servingText = null;
  } else {
    return null;
  }

  const categories = Array.isArray(p.categories_tags) ? p.categories_tags : [];
  return {
    code: typeof p.code === "string" && p.code ? p.code : code,
    name: productName(p),
    servingText,
    kcal: Math.round(kcal),
    proteinG: Math.round(protein * 10) / 10,
    drink: categories.includes("en:beverages"),
  };
}

const USER_AGENT = "TheCorner/2.0 (https://kampduh.com)";
const CACHE_PREFIX = "https://kampduh.com/__off/";
const HIT_SECONDS = 30 * 24 * 60 * 60;
const MISS_SECONDS = 24 * 60 * 60;
const TIMEOUT_MS = 6_000;

// The Workers runtime's own cache. The app's types include the DOM, whose CacheStorage has no `default`.
const workerCache = (): Cache => (caches as unknown as { default: Cache }).default;

export type BarcodeAnswer = { found: true; product: Product } | { found: false; down?: true };

/** One barcode, from the cache or from Open Food Facts. A down or slow OFF is never cached, so the next scan asks again. */
export async function lookupBarcode(code: string, cache: Cache = workerCache()): Promise<BarcodeAnswer> {
  const key = offCode(code);
  const cacheKey = new Request(`${CACHE_PREFIX}${key}`);
  const hit = await cache.match(cacheKey);
  if (hit) return (await hit.json()) as BarcodeAnswer;

  let json: unknown;
  try {
    const res = await fetch(offUrl(key), { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    // OFF answers an unknown code with a 404 and a JSON body; anything else not ok means it is struggling.
    if (!res.ok && res.status !== 404) return { found: false, down: true };
    json = await res.json();
  } catch {
    return { found: false, down: true };
  }

  const product = parseOff(key, json);
  const answer: BarcodeAnswer = product ? { found: true, product } : { found: false };
  await cache.put(cacheKey, Response.json(answer, { headers: { "Cache-Control": `max-age=${product ? HIT_SECONDS : MISS_SECONDS}` } }));
  return answer;
}
