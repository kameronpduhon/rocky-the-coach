import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { mealState } from "~/db/schema";
import { loader } from "~/routes/media";
import { saveMealPhoto } from "~/server/photos.server";
import { db, routeArgs } from "./helpers";

describe("media", () => {
  it("serves an R2 object with its content type and a long cache", async () => {
    await env.MEDIA.put("exercises/Butterfly/0.jpg", new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: "image/jpeg" } });
    const res = (await loader(routeArgs(new Request("http://localhost/media/exercises/Butterfly/0.jpg"), { "*": "exercises/Butterfly/0.jpg" }))) as Response;
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Cache-Control")).toContain("max-age=31536000");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("404s for a missing key", async () => {
    const res = await loader(routeArgs(new Request("http://localhost/media/nope.jpg"), { "*": "nope.jpg" })).catch((e: Response) => e);
    expect((res as Response).status).toBe(404);
  });

  it("stores a meal photo and replaces the old one", async () => {
    const jpeg = new File([new Uint8Array([9, 9])], "a.jpg", { type: "image/jpeg" });
    const first = await saveMealPhoto(db(), "salmon-and-rice", jpeg);
    const second = await saveMealPhoto(db(), "salmon-and-rice", jpeg);
    expect(await env.MEDIA.get(first)).toBeNull();
    expect(await env.MEDIA.get(second)).not.toBeNull();
    const row = await db().select().from(mealState).where(eq(mealState.slug, "salmon-and-rice")).get();
    expect(row?.photoKey).toBe(second);
  });

  it("rejects non-images", async () => {
    const txt = new File(["hi"], "a.txt", { type: "text/plain" });
    await expect(saveMealPhoto(db(), "salmon-and-rice", txt)).rejects.toThrow(/image/);
  });
});
