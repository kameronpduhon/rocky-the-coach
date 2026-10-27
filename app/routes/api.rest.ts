import { env } from "cloudflare:workers";
import { z } from "zod";
import type { Route } from "./+types/api.rest";
import { currentUser } from "~/server/current-user.server";

const Ping = z.object({ seconds: z.number().int().min(1).max(600), title: z.string().min(1).max(80), body: z.string().max(160) });

function timer() {
  return env.REST_TIMER.get(env.REST_TIMER.idFromName(currentUser().dbBinding));
}

export async function loader() {
  return new Response("Method not allowed", { status: 405 });
}

/** POST schedules the rest ping (replacing any earlier one); DELETE cancels it. */
export async function action({ request }: Route.ActionArgs) {
  if (request.method === "DELETE") {
    await timer().cancel();
    return new Response(null, { status: 204 });
  }
  const parsed = Ping.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const { seconds, title, body } = parsed.data;
  await timer().schedule({ binding: currentUser().dbBinding, title, body }, seconds);
  return new Response(null, { status: 204 });
}
