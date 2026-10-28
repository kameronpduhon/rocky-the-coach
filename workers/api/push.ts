import { APP_NAME } from "~/brand";
import { userDb } from "~/server/current-user.server";
import { saveSubscription, sendToAll } from "~/server/push.server";

export async function subscribe(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
  if (!body?.endpoint?.startsWith("https://") || !body.keys?.p256dh || !body.keys.auth) {
    return Response.json({ error: "Bad subscription" }, { status: 400 });
  }
  await saveSubscription(userDb(), { endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } });
  return Response.json({ ok: true });
}

export async function testPush(): Promise<Response> {
  const pushed = await sendToAll(userDb(), { title: APP_NAME, body: "Notifications are working.", url: "/settings", tag: "test" });
  return Response.json({ pushed });
}
