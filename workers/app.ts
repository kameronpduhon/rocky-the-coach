import { createRequestHandler } from "react-router";
import { runScheduled } from "../app/jobs/scheduled";
import { httpsRedirect } from "./https";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request) {
    return httpsRedirect(request) ?? requestHandler(request);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(env, controller.cron, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
