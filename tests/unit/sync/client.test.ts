import { describe, expect, it, vi } from "vitest";
import { SyncClient, type Persistence, type Transport } from "~/sync/client";
import type { SavedState } from "~/sync/store";

function memoryPersistence(): Persistence & { saved: (SavedState & { clientId: string }) | null } {
  const p = {
    saved: null as (SavedState & { clientId: string }) | null,
    async load() {
      return p.saved;
    },
    async save(s: SavedState & { clientId: string }) {
      p.saved = s;
    },
  };
  return p;
}

const ctx = () => ({ now: "2026-10-27T16:00:00.000Z", today: "2026-10-27" });

describe("SyncClient", () => {
  it("pushes a change, then pulls, and ends with nothing waiting", async () => {
    let serverLast = 0;
    const transport: Transport = {
      push: vi.fn(async (body) => {
        serverLast = body.mutations.at(-1)!.id;
        return { ok: true, status: 200, result: { lastMutationId: serverLast, rejected: [] } };
      }),
      pull: vi.fn(async () => ({ ok: true, status: 200, result: { version: 5, lastMutationId: serverLast, snapshot: true, puts: { weigh_ins: [{ date: "2026-10-27", weight_lb: 205 }] }, dels: {} } })),
    };
    const client = new SyncClient({ transport, persistence: memoryPersistence(), context: ctx });
    await client.start();
    await client.mutate("logWeighIn", { date: "2026-10-27", weightLb: 205 });
    await client.idle();
    expect(transport.push).toHaveBeenCalledTimes(1);
    expect(client.store.pending).toHaveLength(0);
    expect(client.status().waiting).toBe(0);
  });

  it("keeps changes when offline and sends them later", async () => {
    let online = false;
    const transport: Transport = {
      push: vi.fn(async (body) => (online ? { ok: true, status: 200, result: { lastMutationId: body.mutations.at(-1)!.id, rejected: [] } } : Promise.reject(new TypeError("offline")))),
      pull: vi.fn(async () => (online ? { ok: true, status: 200, result: { version: 1, lastMutationId: 1, snapshot: true, puts: {}, dels: {} } } : Promise.reject(new TypeError("offline")))),
    };
    const persistence = memoryPersistence();
    const client = new SyncClient({ transport, persistence, context: ctx, retryMs: () => 0 });
    await client.start();
    await client.mutate("setVoice", { voice: "plain" });
    await client.idle();
    expect(client.status().waiting).toBe(1);
    expect(persistence.saved?.pending).toHaveLength(1);
    online = true;
    await client.sync();
    expect(client.status().waiting).toBe(0);
  });

  it("restores a saved queue on start", async () => {
    const persistence = memoryPersistence();
    persistence.saved = { clientId: "saved-client-1", version: 3, nextMutationId: 2, base: {}, pending: [{ id: 1, name: "setVoice", args: { voice: "plain" } }] };
    const transport: Transport = {
      push: vi.fn(async () => ({ ok: true, status: 200, result: { lastMutationId: 1, rejected: [] } })),
      pull: vi.fn(async () => ({ ok: true, status: 200, result: { version: 4, lastMutationId: 1, snapshot: false, puts: { profile: [{ id: "me", voice: "plain" }] }, dels: {} } })),
    };
    const client = new SyncClient({ transport, persistence, context: ctx });
    await client.start();
    await client.idle();
    expect(transport.push).toHaveBeenCalledWith({ clientId: "saved-client-1", mutations: [{ id: 1, name: "setVoice", args: { voice: "plain" } }] });
    expect(client.store.rows("profile")).toEqual([{ id: "me", voice: "plain" }]);
  });

  it("reports rejected changes", async () => {
    const transport: Transport = {
      push: vi.fn(async () => ({ ok: true, status: 200, result: { lastMutationId: 1, rejected: [{ id: 1, message: "That date is in the future." }] } })),
      pull: vi.fn(async () => ({ ok: true, status: 200, result: { version: 1, lastMutationId: 1, snapshot: true, puts: {}, dels: {} } })),
    };
    const client = new SyncClient({ transport, persistence: memoryPersistence(), context: ctx });
    await client.start();
    await client.mutate("setVoice", { voice: "plain" });
    await client.idle();
    expect(client.status().rejected).toEqual(["That date is in the future."]);
  });
});
