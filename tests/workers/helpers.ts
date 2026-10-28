import { env } from "cloudflare:test";
import { getDb } from "~/db/client";
import { hashPassword } from "~/server/password";
import { commitSession, getSession } from "~/server/session.server";
import { routeApi } from "../../workers/api/router";

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

export async function setPassword(nameKey: string, password: string): Promise<void> {
  await env.CORE.prepare("update users set password_hash = ? where name_key = ?").bind(await hashPassword(password), nameKey).run();
}

export async function setIngestToken(nameKey: string, token: string): Promise<void> {
  await env.CORE.prepare("update users set ingest_token = ? where name_key = ?").bind(token, nameKey).run();
}

export const KAMERON = 1;
export const CATHERINE = 2;

/** A session cookie for a user id, as the browser sends it back. */
export async function cookieFor(userId: number): Promise<string> {
  const session = await getSession();
  session.set("userId", userId);
  return (await commitSession(session)).split(";")[0];
}

/** Calls the Worker's API router the way a phone does. `as` signs the request in as that user id. */
export async function api(path: string, init: RequestInit = {}, as?: number): Promise<Response> {
  const headers = new Headers(init.headers);
  if (as !== undefined) headers.set("Cookie", await cookieFor(as));
  const res = await routeApi(new Request(`http://localhost${path}`, { ...init, headers }));
  if (!res) throw new Error(`routeApi passed on ${path}`);
  return res;
}

export const postJson = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
