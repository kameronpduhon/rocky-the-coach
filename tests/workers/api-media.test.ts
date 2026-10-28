import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "~/db/client";
import { mealState } from "~/db/schema";
import { api, CATHERINE, db, KAMERON } from "./helpers";

const upload = (slug: string, photo: Blob | string | null, as?: number) => {
  const body = new FormData();
  if (photo !== null) body.set("photo", photo);
  return api(`/api/meals/${slug}/photo`, { method: "POST", body }, as);
};
const jpeg = () => new File([new Uint8Array([9, 9])], "photo.jpg", { type: "image/jpeg" });

describe("GET /media/*", () => {
  it("serves an R2 object with its content type and a long private cache", async () => {
    await env.MEDIA.put("exercises/Butterfly/0.jpg", new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: "image/jpeg" } });
    const res = await api("/media/exercises/Butterfly/0.jpg", {}, KAMERON);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    expect(res.headers.get("ETag")).toBeTruthy();
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("decodes the key", async () => {
    await env.MEDIA.put("exercises/Seated Row/0.jpg", new Uint8Array([4]));
    expect((await api("/media/exercises/Seated%20Row/0.jpg", {}, KAMERON)).status).toBe(200);
  });

  it("404s a missing key and 401s signed out", async () => {
    expect((await api("/media/nope.jpg", {}, KAMERON)).status).toBe(404);
    expect((await api("/media/exercises/Butterfly/0.jpg")).status).toBe(401);
  });
});

describe("POST /api/meals/:slug/photo", () => {
  it("stores the photo in R2 and on the signed-in person's meal", async () => {
    const res = await upload("steak-and-eggs", jpeg(), KAMERON);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const row = await db().select().from(mealState).where(eq(mealState.slug, "steak-and-eggs")).get();
    expect(await env.MEDIA.get(row!.photoKey!)).not.toBeNull();
    expect((await api(`/media/${row!.photoKey}`, {}, KAMERON)).status).toBe(200);
  });

  it("writes Catherine's photo to her meal_state, not Kameron's", async () => {
    await upload("salmon-and-rice", jpeg(), CATHERINE);
    expect(await getDb(env.DB_CATHERINE).select().from(mealState).where(eq(mealState.slug, "salmon-and-rice")).get()).toBeTruthy();
    expect(await db().select().from(mealState).where(eq(mealState.slug, "salmon-and-rice")).get()).toBeUndefined();
  });

  it("says what is wrong", async () => {
    expect(await (await upload("steak-and-eggs", null, KAMERON)).json()).toEqual({ error: "Choose a photo." });
    const txt = await upload("steak-and-eggs", new File(["hi"], "a.txt", { type: "text/plain" }), KAMERON);
    expect(txt.status).toBe(400);
    expect(await txt.json()).toEqual({ error: "Upload an image" });
  });

  it("404s an unknown meal and 401s signed out", async () => {
    const res = await upload("nope", jpeg(), KAMERON);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
    expect((await upload("steak-and-eggs", jpeg())).status).toBe(401);
  });
});
