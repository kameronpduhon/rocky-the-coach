import { DurableObject } from "cloudflare:workers";
import { getDb } from "~/db/client";
import { RestClock, type RestPing } from "~/rest/clock";
import { sendToAll } from "./push.server";
import type { PersonBinding } from "./users.server";

/** One per person (named by their D1 binding). Holds the next rest ping and sends it at the right second. */
export class RestTimer extends DurableObject<Env> {
  private readonly clock = new RestClock(this.ctx.storage, Date.now, (p) =>
    sendToAll(getDb(this.env[p.binding as PersonBinding]), { title: p.title, body: p.body, url: "/workout", tag: "rest" }),
  );

  schedule(ping: RestPing, seconds: number): Promise<void> {
    return this.clock.schedule(ping, seconds);
  }

  cancel(): Promise<void> {
    return this.clock.cancel();
  }

  async alarm(): Promise<void> {
    await this.clock.fire();
  }
}
