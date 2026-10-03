import { env } from "cloudflare:workers";

/**
 * The server's idea of "now". Under `npm run dev` only, DEV_NOW in .dev.vars (an ISO datetime) pins it so a
 * screen can be shown at a fixed moment. Production builds compile the dev branch away (import.meta.env.DEV is
 * statically false), and tests run in MODE "test", so neither can be steered by it.
 */
export function serverNow(): Date {
  if (import.meta.env.DEV && import.meta.env.MODE === "development") {
    const pinned = (env as { DEV_NOW?: string }).DEV_NOW;
    if (pinned) {
      const d = new Date(pinned);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}
