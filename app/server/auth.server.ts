import { redirect } from "react-router";
import { commitSession, getSession } from "./session.server";
import { userByBinding, userById, type User } from "./users.server";

const PUBLIC_PATHS = [/^\/login$/, /^\/api\/ingest\//];

export type Auth = { user: User; setCookie?: string } | null;

/** The signed-in user for a request. Public paths give null; anything else without a valid session redirects to /login. */
export async function authenticate(request: Request): Promise<Auth> {
  const pathname = new URL(request.url).pathname.replace(/\.data$/, "");
  if (PUBLIC_PATHS.some((re) => re.test(pathname))) return null;
  const session = await getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");
  if (userId) {
    const user = await userById(userId);
    if (user) return { user };
  } else if (session.get("signedIn")) {
    const user = await userByBinding("DB");
    if (user) {
      session.unset("signedIn");
      session.set("userId", user.id);
      return { user, setCookie: await commitSession(session) };
    }
  }
  throw redirect("/login");
}

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}
