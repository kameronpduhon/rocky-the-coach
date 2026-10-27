import { describe, expect, it } from "vitest";
import { stampServiceWorker } from "../../scripts/precache-sw";

const SRC = 'const VERSION = "dev";\nconst PRECACHE = [];\nself.addEventListener("install", () => {});\n';

describe("stampServiceWorker", () => {
  it("writes the build's assets and a version into the worker", () => {
    const out = stampServiceWorker(SRC, ["/assets/b.js", "/assets/a.css"]);
    expect(out).toContain('const PRECACHE = ["/assets/a.css","/assets/b.js"];');
    expect(out).toMatch(/const VERSION = "[0-9a-f]{12}";/);
  });

  it("changes the version when the assets change, so phones install the new worker", () => {
    const version = (s: string) => s.match(/VERSION = "(\w+)"/)![1];
    expect(version(stampServiceWorker(SRC, ["/assets/a.js"]))).not.toBe(version(stampServiceWorker(SRC, ["/assets/b.js"])));
  });

  it("fails the build if sw.js lost its markers", () => {
    expect(() => stampServiceWorker("self.x = 1;", [])).toThrow("sw.js is missing");
  });
});
