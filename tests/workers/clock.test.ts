import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { serverNow } from "~/server/clock.server";

describe("serverNow", () => {
  it("ignores DEV_NOW outside npm run dev", () => {
    (env as { DEV_NOW?: string }).DEV_NOW = "2026-10-12T11:00:00-05:00";
    expect(Math.abs(serverNow().getTime() - Date.now())).toBeLessThan(5000);
  });
});
