import { currentUser } from "~/server/current-user.server";

const NO_STORE = { "Cache-Control": "no-store" };

/** Who is signed in. Replaces the app layout's loader. */
export async function me(): Promise<Response> {
  const user = currentUser();
  return Response.json({ userId: user.id, name: user.name, hasPlan: Boolean(user.planKey) }, { headers: NO_STORE });
}
