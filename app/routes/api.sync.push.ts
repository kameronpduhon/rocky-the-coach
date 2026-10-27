import type { Route } from "./+types/api.sync.push";
import { userD1 } from "~/server/current-user.server";
import { serverNow } from "~/server/clock.server";
import { PushBody, processPush } from "~/sync/push.server";

export async function loader() {
  return new Response("Method not allowed", { status: 405 });
}

export async function action({ request }: Route.ActionArgs) {
  const parsed = PushBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad push" }, { status: 400 });
  return Response.json(await processPush(userD1(), parsed.data, serverNow()));
}
