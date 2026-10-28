import { authenticate } from "~/server/auth.server";
import { runAsUser } from "~/server/current-user.server";

/** Runs a handler as the signed-in person. Signed out gets a 401, never a redirect: every caller is fetch(). */
export async function withUser(request: Request, run: () => Promise<Response>): Promise<Response> {
  let auth: Awaited<ReturnType<typeof authenticate>>;
  try {
    auth = await authenticate(request);
  } catch (err) {
    // Until Task 9, authenticate throws a redirect or a 401 Response when signed out.
    if (!(err instanceof Response)) throw err;
    auth = null;
  }
  if (!auth) return Response.json({ error: "Signed out" }, { status: 401 });
  const response = await runAsUser(auth.user, run);
  if (auth.setCookie) response.headers.append("Set-Cookie", auth.setCookie);
  return response;
}
