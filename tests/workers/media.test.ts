import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { mealState } from "~/db/schema";
import { saveMealPhoto } from "~/server/photos.server";
import { db } from "./helpers";

describe("media", () => {
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
