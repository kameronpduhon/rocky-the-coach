import { commitSession, getSession } from "./session.server";
import { userByBinding, userById, type User } from "./users.server";

export type Auth = { user: User; setCookie?: string };

/** The signed-in person for a request, or null when signed out. A v1 cookie is upgraded to Kameron's id. */
export async function authenticate(request: Request): Promise<Auth | null> {
  const session = await getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");
  if (userId) {
    const user = await userById(userId);
    return user ? { user } : null;
  }
  if (session.get("signedIn")) {
    const user = await userByBinding("DB");
    if (!user) return null;
    session.unset("signedIn");
    session.set("userId", user.id);
    return { user, setCookie: await commitSession(session) };
  }
  return null;
}

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}
