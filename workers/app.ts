import { createRequestHandler } from "react-router";
import { runScheduled } from "../app/jobs/scheduled";
import { routeApi } from "./api/router";
import { httpsRedirect } from "./https";

export { RestTimer } from "../app/server/rest-timer.server";

// SPA mode serves the built index.html for every app path. React Router's handler only renders that shell when the
// assets have no file for a navigation: at build time (the prerender of index.html runs through this Worker in
// `vite preview`) and under `npm run dev`. In production every navigation finds index.html.
const renderShell = createRequestHandler(() => import("virtual:react-router/server-build"), import.meta.env.MODE);

const navigating = (request: Request) => request.headers.get("Sec-Fetch-Mode") === "navigate" || request.headers.has("X-React-Router-SPA-Mode");

export default {
  async fetch(request, env) {
    const toHttps = httpsRedirect(request);
    if (toHttps) return toHttps;
    const api = await routeApi(request);
    if (api) return api;
    // Only a phone still running the SSR build asks for loader data. There is none now; its error page offers Reload.
    if (new URL(request.url).pathname.endsWith(".data")) return new Response("Not found", { status: 404 });
    const asset = await env.ASSETS.fetch(request);
    if (asset.status === 404 && navigating(request)) return renderShell(request);
    return asset;
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(env, controller.cron, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
