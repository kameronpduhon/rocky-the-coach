import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { mealState } from "~/db/schema";
import { action } from "~/routes/meal";
import { db, post, routeArgs } from "./helpers";

// Every other meal tap is a named change on the phone now. Only the photo goes to the server, because it is stored in R2.
describe("meal route", () => {
  it("saves a photo for the meal", async () => {
    const photo = new File([new Uint8Array([9, 9])], "photo.jpg", { type: "image/jpeg" });
    expect(await action(routeArgs(post("http://localhost/meal/steak-and-eggs", { intent: "photo", photo }), { slug: "steak-and-eggs" }))).toEqual({ ok: true });
    const row = await db().select().from(mealState).where(eq(mealState.slug, "steak-and-eggs")).get();
    expect(await env.MEDIA.get(row!.photoKey!)).not.toBeNull();
  });

  it("no longer takes the v1 meal actions", async () => {
    const res = await action(routeArgs(post("http://localhost/meal/steak-and-eggs", { intent: "ate", slot: "breakfast" }), { slug: "steak-and-eggs" }));
    expect(res).toEqual({ error: "Choose a photo." });
  });

  it("says when the file isn't an image", async () => {
    const txt = new File(["hi"], "a.txt", { type: "text/plain" });
    expect(await action(routeArgs(post("http://localhost/meal/steak-and-eggs", { intent: "photo", photo: txt }), { slug: "steak-and-eggs" }))).toEqual({ error: "Upload an image" });
  });

  it("404s an unknown meal", async () => {
    const res = await action(routeArgs(post("http://localhost/meal/nope", { intent: "photo" }), { slug: "nope" })).catch((e: Response) => e);
    expect((res as Response).status).toBe(404);
  });
});
