import { z } from "zod";
import { userD1 } from "~/server/current-user.server";

const Beacon = z.object({ route: z.string().max(200), inp: z.number().int().min(0).max(60_000), target: z.string().max(200).optional() });

export async function vitals(request: Request): Promise<Response> {
  const parsed = Beacon.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const { route, inp, target } = parsed.data;
  await userD1().prepare("INSERT INTO vitals (route, inp_ms, target, at) VALUES (?, ?, ?, ?)").bind(route, inp, target ?? null, new Date().toISOString()).run();
  return new Response(null, { status: 204 });
}
