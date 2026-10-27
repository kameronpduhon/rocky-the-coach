import { env } from "cloudflare:workers";
import type { Route } from "./+types/api.ingest.steps";
import { daysBetween, localDate } from "~/domain/dates";
import { upsertSteps } from "~/server/body.server";
import { serverNow } from "~/server/clock.server";
import { personDb, userByBinding, userByIngestToken, type User } from "~/server/users.server";

// The DOM lib's SubtleCrypto typing shadows the Workers one, which is where timingSafeEqual lives.
const subtle = crypto.subtle as unknown as { timingSafeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean };

function legacyTokenMatches(given: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(given);
  const b = enc.encode(env.INGEST_TOKEN ?? "");
  if (b.byteLength === 0 || a.byteLength !== b.byteLength) return false;
  return subtle.timingSafeEqual(a, b);
}

async function userForToken(header: string | null): Promise<User | null> {
  const token = header?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return null;
  // The v1 token still means Kameron until his Shortcut sends his own token.
  if (legacyTokenMatches(token)) return userByBinding("DB");
  return userByIngestToken(token);
}

export async function loader() {
  return new Response("Method not allowed", { status: 405 });
}

export async function action({ request }: Route.ActionArgs) {
  const user = await userForToken(request.headers.get("Authorization"));
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { date?: string; steps?: number | string } | null;
  const date = body?.date ?? "";
  const raw = String(body?.steps ?? "").replace(/,/g, "").trim();
  const steps = raw === "" ? Number.NaN : Math.round(Number(raw));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Math.abs(daysBetween(localDate(serverNow()), date)) > 2) {
    return Response.json({ error: "Bad date" }, { status: 400 });
  }
  if (!Number.isFinite(steps) || steps < 0 || steps > 100_000) return Response.json({ error: "Bad steps" }, { status: 400 });
  await upsertSteps(personDb(user), date, steps, new Date());
  return Response.json({ ok: true, date, steps });
}
