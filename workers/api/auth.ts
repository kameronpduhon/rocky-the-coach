import { authenticate } from "~/server/auth.server";
import { runAsUser } from "~/server/current-user.server";

/** Runs a handler as the signed-in person. Signed out gets a 401, never a redirect: every caller is fetch(). */
export async function withUser(request: Request, run: () => Promise<Response>): Promise<Response> {
  const auth = await authenticate(request);
  if (!auth) return Response.json({ error: "Signed out" }, { status: 401 });
  const response = await runAsUser(auth.user, run);
  if (auth.setCookie) response.headers.append("Set-Cookie", auth.setCookie);
  return response;
}
