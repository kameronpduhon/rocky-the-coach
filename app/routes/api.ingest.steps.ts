import { env } from "cloudflare:workers";
import type { Route } from "./+types/api.ingest.steps";
import { getDb } from "~/db/client";
import { daysBetween, localDate } from "~/domain/dates";
import { upsertSteps } from "~/server/body.server";
import { serverNow } from "~/server/clock.server";

// The DOM lib's SubtleCrypto typing shadows the Workers one, which is where timingSafeEqual lives.
const subtle = crypto.subtle as unknown as { timingSafeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean };

function tokenMatches(header: string | null): boolean {
  const enc = new TextEncoder();
  const given = enc.encode(header?.replace(/^Bearer\s+/i, "").trim() ?? "");
  const expected = enc.encode(env.INGEST_TOKEN ?? "");
  if (expected.byteLength === 0 || given.byteLength !== expected.byteLength) return false;
  return subtle.timingSafeEqual(given, expected);
}

export async function loader() {
  return new Response("Method not allowed", { status: 405 });
}

export async function action({ request }: Route.ActionArgs) {
  if (!tokenMatches(request.headers.get("Authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { date?: string; steps?: number | string } | null;
  const date = body?.date ?? "";
  const raw = String(body?.steps ?? "").replace(/,/g, "").trim();
  const steps = raw === "" ? Number.NaN : Math.round(Number(raw));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Math.abs(daysBetween(localDate(serverNow()), date)) > 2) {
    return Response.json({ error: "Bad date" }, { status: 400 });
  }
  if (!Number.isFinite(steps) || steps < 0 || steps > 100_000) return Response.json({ error: "Bad steps" }, { status: 400 });
  await upsertSteps(getDb(env.DB), date, steps, new Date());
  return Response.json({ ok: true, date, steps });
}
