import { env } from "cloudflare:test";
import { getDb } from "~/db/client";

export const db = () => getDb(env.DB);

/** Build a Date for a Chicago wall-clock time (CDT, UTC-5, valid for Oct 2026 tests). */
export function chicago(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00-05:00`);
}

export const routeArgs = (request: Request, params: Record<string, string> = {}) => ({ request, params, context: {} }) as any;

export function post(url: string, fields: Record<string, string | Blob>): Request {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return new Request(url, { method: "POST", body });
}
