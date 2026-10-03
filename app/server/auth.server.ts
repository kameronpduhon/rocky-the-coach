import { env } from "cloudflare:workers";
import { and, eq, gte } from "drizzle-orm";
import { redirect } from "react-router";
import { getDb } from "~/db/client";
import { loginAttempts } from "~/db/schema";
import { getSession } from "./session.server";

const PUBLIC_PATHS = [/^\/login$/, /^\/api\/ingest\//];

export async function requireSignedIn(request: Request): Promise<void> {
  const pathname = new URL(request.url).pathname.replace(/\.data$/, "");
  if (PUBLIC_PATHS.some((re) => re.test(pathname))) return;
  const session = await getSession(request.headers.get("Cookie"));
  if (!session.get("signedIn")) throw redirect("/login");
}

// The DOM lib's SubtleCrypto typing shadows the Workers one, which is where timingSafeEqual lives.
const subtle = crypto.subtle as unknown as { timingSafeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean };

export async function passwordMatches(candidate: string): Promise<boolean> {
  const enc = new TextEncoder();
  const a = enc.encode(candidate);
  const b = enc.encode(env.APP_PASSWORD);
  if (a.byteLength !== b.byteLength) {
    subtle.timingSafeEqual(b, b);
    return false;
  }
  return subtle.timingSafeEqual(a, b);
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export async function isLockedOut(ip: string, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  const rows = await getDb(env.DB)
    .select({ id: loginAttempts.id })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), gte(loginAttempts.attemptedAt, since)))
    .all();
  return rows.length >= MAX_FAILURES;
}

export async function recordFailure(ip: string, now = new Date()): Promise<void> {
  await getDb(env.DB).insert(loginAttempts).values({ ip, attemptedAt: now.toISOString() });
}

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}
