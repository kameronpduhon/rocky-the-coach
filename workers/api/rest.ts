import { env } from "cloudflare:workers";
import { z } from "zod";
import { currentUser } from "~/server/current-user.server";

const Ping = z.object({ seconds: z.number().int().min(1).max(600), title: z.string().min(1).max(80), body: z.string().max(160) });

function timer() {
  return env.REST_TIMER.get(env.REST_TIMER.idFromName(currentUser().dbBinding));
}

/** Schedules the rest ping, replacing any earlier one. */
export async function scheduleRest(request: Request): Promise<Response> {
  const parsed = Ping.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const { seconds, title, body } = parsed.data;
  await timer().schedule({ binding: currentUser().dbBinding, title, body }, seconds);
  return new Response(null, { status: 204 });
}

export async function cancelRest(): Promise<Response> {
  await timer().cancel();
  return new Response(null, { status: 204 });
}
