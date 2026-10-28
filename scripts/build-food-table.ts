// Builds content/food-table.json: content/food-table.source.json with calories and protein per 100 g from USDA
// FoodData Central (public domain). Run by hand; commit the output.
//
// Usage:
//   npx tsx scripts/build-food-table.ts                    downloads FDC's three bulk JSON files (about 300 MB unzipped)
//   npx tsx scripts/build-food-table.ts --dir <path>       reuses files already downloaded and unzipped there
//   npx tsx scripts/build-food-table.ts --api              asks the FDC API instead (FDC_API_KEY, or DEMO_KEY)
//   npx tsx scripts/build-food-table.ts --checked <tsv>    uses a checked list: the P5e plan's Appendix A
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FoodTableEntrySchema, FoodTableSourceSchema, type FoodTableEntry, type FoodTableSource } from "../app/content/schema";

export const FDC_FILES = [
  { url: "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip", json: "FoodData_Central_sr_legacy_food_json_2018-04.json", key: "SRLegacyFoods" },
  { url: "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_json_2026-04-30.zip", json: "FoodData_Central_foundation_food_json_2026-04-30.json", key: "FoundationFoods" },
  { url: "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip", json: "surveyDownload.json", key: "SurveyFoods" },
];
const API = "https://api.nal.usda.gov/fdc/v1/foods";
const API_BATCH = 20;
const KJ_PER_KCAL = 4.184;

export interface FdcNutrient {
  nutrient?: { number?: string };
  amount?: number;
}
export interface FdcFood {
  fdcId: number;
  foodNutrients: FdcNutrient[];
}
export interface Numbers {
  kcalPer100: number;
  proteinPer100: number;
}

function amount(nutrients: FdcNutrient[], number: string): number | undefined {
  return nutrients.find((x) => x.nutrient?.number === number && typeof x.amount === "number")?.amount;
}

/** Energy (208); Foundation foods may only have Atwater General (957) or Specific (958); else kJ (268). */
export function energyKcal(nutrients: FdcNutrient[]): number | undefined {
  const kcal = amount(nutrients, "208") ?? amount(nutrients, "957") ?? amount(nutrients, "958");
  if (kcal !== undefined) return kcal;
  const kj = amount(nutrients, "268");
  return kj === undefined ? undefined : kj / KJ_PER_KCAL;
}

export function numbersOf(food: FdcFood): Numbers | undefined {
  const kcal = energyKcal(food.foodNutrients);
  const protein = amount(food.foodNutrients, "203");
  if (kcal === undefined || protein === undefined) return undefined;
  return { kcalPer100: Math.round(kcal), proteinPer100: Math.round(protein * 100) / 100 };
}

export function buildFoodTable(source: FoodTableSource[], numbers: Map<number, Numbers>): FoodTableEntry[] {
  const missing = source.filter((s) => !numbers.has(s.fdcId)).map((s) => `${s.id} (${s.fdcId})`);
  if (missing.length) throw new Error(`No FDC numbers for: ${missing.join(", ")}`);
  return source.map((s) => FoodTableEntrySchema.parse({ ...s, ...numbers.get(s.fdcId)! }));
}

export function readChecked(tsv: string): Map<number, Numbers> {
  const rows = tsv.trim().split("\n").slice(1);
  return new Map(
    rows.map((line) => {
      const [, fdcId, kcal, protein] = line.split("\t");
      return [Number(fdcId), { kcalPer100: Number(kcal), proteinPer100: Number(protein) }];
    }),
  );
}

async function fromDownloads(dir: string, ids: Set<number>): Promise<Map<number, Numbers>> {
  mkdirSync(dir, { recursive: true });
  const out = new Map<number, Numbers>();
  for (const f of FDC_FILES) {
    const jsonPath = path.join(dir, f.json);
    if (!existsSync(jsonPath)) {
      console.log(`Downloading ${f.url}`);
      const res = await fetch(f.url);
      if (!res.ok) throw new Error(`${f.url}: HTTP ${res.status}`);
      const zip = path.join(dir, path.basename(f.url));
      writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
      execFileSync("unzip", ["-o", "-q", zip, "-d", dir]);
    }
    const foods = (JSON.parse(readFileSync(jsonPath, "utf8")) as Record<string, (FdcFood | null)[]>)[f.key] ?? [];
    for (const food of foods) {
      if (!food || !ids.has(food.fdcId)) continue;
      const n = numbersOf(food);
      if (n) out.set(food.fdcId, n);
    }
  }
  return out;
}

async function fromApi(ids: number[]): Promise<Map<number, Numbers>> {
  const key = process.env.FDC_API_KEY ?? "DEMO_KEY";
  const out = new Map<number, Numbers>();
  for (let i = 0; i < ids.length; i += API_BATCH) {
    const res = await fetch(`${API}?api_key=${key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fdcIds: ids.slice(i, i + API_BATCH), format: "full" }) });
    if (!res.ok) throw new Error(`FDC API: HTTP ${res.status}`);
    for (const food of (await res.json()) as FdcFood[]) {
      const n = numbersOf(food);
      if (n) out.set(food.fdcId, n);
    }
  }
  return out;
}

async function main() {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const source = FoodTableSourceSchema.array().parse(JSON.parse(readFileSync(path.join(root, "content/food-table.source.json"), "utf8")));
  const ids = [...new Set(source.map((s) => s.fdcId))];

  let numbers: Map<number, Numbers>;
  if (args.includes("--api")) numbers = await fromApi(ids);
  else if (flag("--checked")) numbers = readChecked(readFileSync(flag("--checked")!, "utf8"));
  else numbers = await fromDownloads(flag("--dir") ?? path.join(tmpdir(), "rocky-fdc"), new Set(ids));

  const table = buildFoodTable(source, numbers);
  writeFileSync(path.join(root, "content/food-table.json"), `[\n${table.map((f) => `  ${JSON.stringify(f)}`).join(",\n")}\n]\n`);
  console.log(`Wrote ${table.length} foods to content/food-table.json`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
