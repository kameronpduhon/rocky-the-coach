import { login, logout, me } from "./account";
import { withUser } from "./auth";
import { ingestSteps } from "./ingest";
import { mealPhoto, media } from "./media";
import { subscribe } from "./push";
import { cancelRest, scheduleRest } from "./rest";
import { pull, push } from "./sync";
import { vitals } from "./vitals";

type Run = (request: Request, params: string[]) => Promise<Response>;
type ApiRoute = { method: string; path: RegExp; run: Run; open?: true };

const ROUTES: ApiRoute[] = [
  { method: "GET", path: /^\/api\/me$/, run: me },
  { method: "POST", path: /^\/api\/login$/, run: login, open: true },
  { method: "POST", path: /^\/api\/logout$/, run: logout, open: true },
  { method: "GET", path: /^\/api\/sync\/pull$/, run: pull },
  { method: "POST", path: /^\/api\/sync\/push$/, run: push },
  { method: "POST", path: /^\/api\/vitals$/, run: vitals },
  { method: "POST", path: /^\/api\/push\/subscribe$/, run: subscribe },
  { method: "POST", path: /^\/api\/rest$/, run: scheduleRest },
  { method: "DELETE", path: /^\/api\/rest$/, run: cancelRest },
  { method: "POST", path: /^\/api\/ingest\/steps$/, run: ingestSteps, open: true },
  { method: "GET", path: /^\/media\/(.+)$/, run: media },
  { method: "POST", path: /^\/api\/meals\/([^/]+)\/photo$/, run: mealPhoto },
];

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** Answers the Worker's own paths ahead of the app. Null means the path isn't an endpoint. */
export async function routeApi(request: Request): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  const onPath = ROUTES.filter((r) => r.path.test(pathname));
  if (!onPath.length) return null;
  const route = onPath.find((r) => r.method === request.method);
  if (!route) return new Response("Method not allowed", { status: 405, headers: { Allow: onPath.map((r) => r.method).join(", ") } });
  const params = route.path.exec(pathname)!.slice(1).map(decode);
  return route.open ? route.run(request, params) : withUser(request, () => route.run(request, params));
}
