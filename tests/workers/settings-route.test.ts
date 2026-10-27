import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { action, loader } from "~/routes/settings";
import { post, routeArgs } from "./helpers";

describe("settings actions", () => {
  it("reports how many devices took a test push", async () => {
    expect(await action(routeArgs(post("http://localhost/settings", { intent: "test-push" })))).toEqual({ pushed: 0 });
  });

  it("backs up on demand", async () => {
    const res = (await action(routeArgs(post("http://localhost/settings", { intent: "backup" })))) as { backup: string };
    expect(res.backup).toMatch(/^backups\/kameron\/\d{4}-\d{2}-\d{2}\.json$/);
    expect(await env.MEDIA.get(res.backup)).not.toBeNull();
  });

  it("leaves reminder changes to the store", async () => {
    expect(await action(routeArgs(post("http://localhost/settings", { kind: "weigh-in", enabled: "true", time: "06:45" })))).toEqual({ error: "Unknown action" });
  });

  it("names the other person and gives the ingest address", async () => {
    const data = await loader(routeArgs(new Request("http://localhost/settings")));
    expect(data).toMatchObject({ name: "Kameron", otherName: "Catherine", hasPlan: true, ingestUrl: "http://localhost/api/ingest/steps" });
  });
});
