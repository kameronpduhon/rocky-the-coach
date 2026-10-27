import type { Route } from "./+types/api.sync.pull";
import { userD1 } from "~/server/current-user.server";
import { processPull } from "~/sync/pull.server";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const since = Number(url.searchParams.get("since") ?? "0");
  const clientId = url.searchParams.get("clientId") ?? "";
  if (!Number.isInteger(since) || since < 0 || clientId.length < 8) return Response.json({ error: "Bad pull" }, { status: 400 });
  return Response.json(await processPull(userD1(), since, clientId), { headers: { "Cache-Control": "no-store" } });
}
