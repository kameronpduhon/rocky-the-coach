import { clientIp } from "~/server/auth.server";
import { currentUser } from "~/server/current-user.server";
import { verifyPassword } from "~/server/password";
import { commitSession, destroySession, getSession } from "~/server/session.server";
import { credentialsFor, isLockedOut, recordFailure } from "~/server/users.server";

const NO_STORE = { "Cache-Control": "no-store" };

/** Who is signed in. Replaces the app layout's loader. */
export async function me(): Promise<Response> {
  const user = currentUser();
  return Response.json({ userId: user.id, name: user.name, hasPlan: Boolean(user.planKey) }, { headers: NO_STORE });
}

/** JSON { name, password }. 204 with the session cookie, 401 for a wrong pair, 429 when this IP is locked out. */
export async function login(request: Request): Promise<Response> {
  const ip = clientIp(request);
  if (await isLockedOut(ip)) return Response.json({ error: "Too many tries. Wait 15 minutes." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { name?: unknown; password?: unknown } | null;
  const found = await credentialsFor(String(body?.name ?? ""));
  const ok = await verifyPassword(String(body?.password ?? ""), found?.passwordHash ?? null);
  if (!found || !ok) {
    await recordFailure(ip);
    return Response.json({ error: "That name and password don't match." }, { status: 401 });
  }
  const session = await getSession(request.headers.get("Cookie"));
  session.unset("signedIn");
  session.set("userId", found.user.id);
  return new Response(null, { status: 204, headers: { "Set-Cookie": await commitSession(session) } });
}

export async function logout(request: Request): Promise<Response> {
  const session = await getSession(request.headers.get("Cookie"));
  return new Response(null, { status: 204, headers: { "Set-Cookie": await destroySession(session) } });
}
