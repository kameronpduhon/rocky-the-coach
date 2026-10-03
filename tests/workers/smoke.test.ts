import { env } from "cloudflare:test";
import { expect, it } from "vitest";
it("has D1 and R2 bindings", async () => {
  expect(await env.DB.prepare("select 1 as one").first()).toEqual({ one: 1 });
  await env.MEDIA.put("smoke.txt", "ok");
  expect(await (await env.MEDIA.get("smoke.txt"))!.text()).toBe("ok");
});
