import { me } from "./account";
import { withUser } from "./auth";

type Run = (request: Request, params: string[]) => Promise<Response>;
type ApiRoute = { method: string; path: RegExp; run: Run; open?: true };

const ROUTES: ApiRoute[] = [{ method: "GET", path: /^\/api\/me$/, run: me }];

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
