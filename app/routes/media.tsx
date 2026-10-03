import { env } from "cloudflare:workers";
import type { Route } from "./+types/media";

export async function loader({ params }: Route.LoaderArgs) {
  const key = params["*"];
  const obj = key ? await env.MEDIA.get(key) : null;
  if (!obj) throw new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: obj.httpEtag,
    },
  });
}
