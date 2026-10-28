import { env } from "cloudflare:workers";
import { meals } from "~/content";
import { userDb } from "~/server/current-user.server";
import { saveMealPhoto } from "~/server/photos.server";

export async function media(_request: Request, [key]: string[]): Promise<Response> {
  const obj = key ? await env.MEDIA.get(key) : null;
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: obj.httpEtag,
    },
  });
}

/** Multipart `photo`. The new photo_key reaches the phone with its next pull. */
export async function mealPhoto(request: Request, [slug]: string[]): Promise<Response> {
  if (!meals.has(slug)) return Response.json({ error: "Not found" }, { status: 404 });
  const photo = (await request.formData().catch(() => null))?.get("photo");
  if (!(photo instanceof File)) return Response.json({ error: "Choose a photo." }, { status: 400 });
  try {
    await saveMealPhoto(userDb(), slug, photo);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "That photo didn't save." }, { status: 400 });
  }
  return Response.json({ ok: true });
}
