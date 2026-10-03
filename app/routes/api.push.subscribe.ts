import { env } from "cloudflare:workers";
import type { Route } from "./+types/api.push.subscribe";
import { getDb } from "~/db/client";
import { saveSubscription } from "~/server/push.server";

export async function loader() {
  return new Response("Method not allowed", { status: 405 });
}

export async function action({ request }: Route.ActionArgs) {
  const body = (await request.json().catch(() => null)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
  if (!body?.endpoint?.startsWith("https://") || !body.keys?.p256dh || !body.keys.auth) {
    return Response.json({ error: "Bad subscription" }, { status: 400 });
  }
  await saveSubscription(getDb(env.DB), { endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } });
  return Response.json({ ok: true });
}
