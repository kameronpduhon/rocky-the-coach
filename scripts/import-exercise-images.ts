// Usage: npx tsx scripts/import-exercise-images.ts --local   (dev)
//        npx tsx scripts/import-exercise-images.ts --remote  (production)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const exercises: { dbId: string }[] = JSON.parse(readFileSync("content/exercises.json", "utf8"));

const target = process.argv.includes("--remote") ? "--remote" : "--local";
const BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";
const CACHE = ".exercise-images";
mkdirSync(CACHE, { recursive: true });

for (const ex of exercises) {
  for (const frame of [0, 1]) {
    const file = `${CACHE}/${ex.dbId}__${frame}.jpg`;
    if (!existsSync(file)) {
      const res = await fetch(`${BASE}/${ex.dbId}/${frame}.jpg`);
      if (!res.ok) throw new Error(`Download failed for ${ex.dbId}/${frame}: ${res.status}`);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    }
    execFileSync(
      "npx",
      ["wrangler", "r2", "object", "put", `rocky-media/exercises/${ex.dbId}/${frame}.jpg`, "--file", file, "--content-type", "image/jpeg", target],
      { stdio: "inherit" },
    );
  }
}
console.log(`Uploaded ${exercises.length * 2} images (${target}).`);
