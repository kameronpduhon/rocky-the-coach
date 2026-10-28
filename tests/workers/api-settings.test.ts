import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { api, CATHERINE, KAMERON, setIngestToken } from "./helpers";

describe("GET /api/settings", () => {
  it("gives Kameron the other name, the ingest address, his token and the VAPID key", async () => {
    const res = await api("/api/settings", {}, KAMERON);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      otherName: "Catherine",
      ingestUrl: "http://localhost/api/ingest/steps",
      // His Shortcut still sends the v1 INGEST_TOKEN until he switches to his own.
      ingestToken: "test-ingest-token",
      vapidPublicKey: env.VAPID_PUBLIC_KEY,
    });
  });

  it("gives Catherine her own token, and no v1 fallback", async () => {
    expect(await (await api("/api/settings", {}, CATHERINE)).json()).toMatchObject({ otherName: "Kameron", ingestToken: null });
    await setIngestToken("catherine", "cat-token");
    expect(await (await api("/api/settings", {}, CATHERINE)).json()).toMatchObject({ ingestToken: "cat-token" });
  });

  it("is a 401 signed out", async () => {
    expect((await api("/api/settings")).status).toBe(401);
  });
});

describe("POST /api/push/test", () => {
  it("reports how many devices took it", async () => {
    expect(await (await api("/api/push/test", { method: "POST" }, KAMERON)).json()).toEqual({ pushed: 0 });
  });
});

describe("POST /api/backup", () => {
  it("backs up the signed-in person's database under their name", async () => {
    const mine = (await (await api("/api/backup", { method: "POST" }, KAMERON)).json()) as { backup: string };
    const hers = (await (await api("/api/backup", { method: "POST" }, CATHERINE)).json()) as { backup: string };
    expect(mine.backup).toMatch(/^backups\/kameron\/\d{4}-\d{2}-\d{2}\.json$/);
    expect(hers.backup).toMatch(/^backups\/catherine\/\d{4}-\d{2}-\d{2}\.json$/);
    expect(await env.MEDIA.get(mine.backup)).not.toBeNull();
    expect(await env.MEDIA.get(hers.backup)).not.toBeNull();
  });
});
