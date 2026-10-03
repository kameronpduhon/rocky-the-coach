import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import type { Db } from "~/db/client";
import { pushSubscriptions } from "~/db/schema";

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

// Apple rejects VAPID tokens whose subject is not a mailto: or a real https origin.
const VAPID_SUBJECT = "https://kampduh.com";

export async function saveSubscription(db: Db, sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, createdAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
}

/** Sends to every stored subscription. Returns how many the push services accepted. */
export async function sendToAll(
  db: Db,
  message: PushMessage,
  vapid: VapidKeys = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
): Promise<number> {
  const subs = await db.select().from(pushSubscriptions).all();
  let accepted = 0;
  for (const s of subs) {
    const subscription: PushSubscription = { endpoint: s.endpoint, expirationTime: null, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      const payload = await buildPushPayload(
        { data: { ...message }, options: { ttl: 3600, urgency: "normal" } },
        subscription,
        { subject: VAPID_SUBJECT, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      );
      const res = await fetch(s.endpoint, payload);
      if (res.status === 404 || res.status === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint));
      else if (res.ok) accepted++;
      else console.log(`[push] ${res.status} from ${new URL(s.endpoint).host}`);
    } catch (err) {
      // One bad subscription or a missing key must not stop the rest.
      console.log(`[push] send failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return accepted;
}
