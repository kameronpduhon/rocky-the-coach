import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  route("media/*", "routes/media.tsx"),
  layout("routes/app-layout.tsx", [
    index("routes/today.tsx"),
    route("plan", "routes/plan.tsx"),
    route("progress", "routes/progress.tsx"),
    route("library", "routes/library.tsx"),
    route("settings", "routes/settings.tsx"),
  ]),
] satisfies RouteConfig;
