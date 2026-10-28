import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP = join(import.meta.dirname, "../../app");
const MODULES = ["root.tsx", ...readdirSync(join(APP, "routes")).filter((f) => /\.tsx?$/.test(f)).map((f) => `routes/${f}`)];

// SPA mode refuses these in any route but the root, and the root needs none of them.
const SERVER_EXPORT = /export\s+(async\s+)?(function|const|let)\s+(loader|action|middleware|headers)\b/;
// `import type` is erased, so only value imports count.
const SERVER_IMPORT = /^import\s+(?!type\b)[^;]*?from\s+"(cloudflare:workers|~\/server\/[^"]+|[^"]+\.server)"/m;

describe("route modules", () => {
  it.each(MODULES)("%s exports no loader, action, middleware or headers", (file) => {
    expect(readFileSync(join(APP, file), "utf8")).not.toMatch(SERVER_EXPORT);
  });

  it.each(MODULES)("%s imports nothing server-only", (file) => {
    expect(readFileSync(join(APP, file), "utf8")).not.toMatch(SERVER_IMPORT);
  });
});
