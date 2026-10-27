import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

const VERSION_LINE = 'const VERSION = "dev";';
const PRECACHE_LINE = "const PRECACHE = [];";

/** Puts the build's asset list and a version into sw.js. The bytes change with every build, so phones install it. */
export function stampServiceWorker(src: string, files: string[]): string {
  if (!src.includes(VERSION_LINE) || !src.includes(PRECACHE_LINE)) throw new Error("sw.js is missing its VERSION or PRECACHE line");
  const list = [...files].sort();
  const version = createHash("sha256").update(list.join("\n")).digest("hex").slice(0, 12);
  return src.replace(VERSION_LINE, `const VERSION = "${version}";`).replace(PRECACHE_LINE, `const PRECACHE = ${JSON.stringify(list)};`);
}

/**
 * Once every environment has built, stamps the copied public/sw.js with every hashed script, style and font. It reads
 * the folder, not the client bundle, because React Router writes its route manifest during the server build.
 */
export function precacheServiceWorker(): Plugin {
  return {
    name: "rocky-precache-sw",
    buildApp: {
      order: "post",
      async handler(builder) {
        const dir = builder.environments.client.config.build.outDir;
        const files = readdirSync(join(dir, "assets"))
          .filter((f) => /\.(js|css|woff2)$/.test(f))
          .map((f) => `/assets/${f}`);
        const path = join(dir, "sw.js");
        writeFileSync(path, stampServiceWorker(readFileSync(path, "utf8"), files));
      },
    },
  };
}
