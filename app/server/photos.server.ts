import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import type { Db } from "~/db/client";
import { mealState } from "~/db/schema";

const MAX_BYTES = 8 * 1024 * 1024;

export async function saveMealPhoto(db: Db, slug: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Upload an image");
  if (file.size > MAX_BYTES) throw new Error("Image is too large");
  const key = `meals/${slug}/${crypto.randomUUID()}.jpg`;
  await env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: "image/jpeg" } });
  const old = await db.select().from(mealState).where(eq(mealState.slug, slug)).get();
  await db.insert(mealState).values({ slug, photoKey: key }).onConflictDoUpdate({ target: mealState.slug, set: { photoKey: key } });
  if (old?.photoKey) await env.MEDIA.delete(old.photoKey);
  return key;
}
