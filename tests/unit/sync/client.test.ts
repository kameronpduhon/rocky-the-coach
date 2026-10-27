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
    expect(client.status().rejected).toEqual(["Voice setting didn't save. That date is in the future."]);
  });

  it("refuses a change the rules turn down, without queueing it", async () => {
    const transport: Transport = {
      push: vi.fn(async () => ({ ok: true, status: 200, result: { lastMutationId: 0, rejected: [] } })),
      pull: vi.fn(async () => ({ ok: true, status: 200, result: { version: 1, lastMutationId: 0, snapshot: true, puts: {}, dels: {} } })),
    };
    const client = new SyncClient({ transport, persistence: memoryPersistence(), context: ctx });
    await client.start();
    expect(await client.mutate("logWeighIn", { date: "2026-12-25", weightLb: 205 })).toBe(false);
    expect(client.status().waiting).toBe(0);
    expect(client.status().rejected).toEqual(["Weigh-in didn't save. That date is in the future."]);
  });

  it("sends at most 500 changes per push and keeps going", async () => {
    const sizes: number[] = [];
    let serverLast = 0;
    const transport: Transport = {
      push: vi.fn(async (body) => {
        sizes.push(body.mutations.length);
        serverLast = body.mutations.at(-1)!.id;
        return { ok: true, status: 200, result: { lastMutationId: serverLast, rejected: [] } };
      }),
      pull: vi.fn(async () => ({ ok: true, status: 200, result: { version: 1, lastMutationId: serverLast, snapshot: true, puts: {}, dels: {} } })),
    };
    const persistence = memoryPersistence();
    persistence.saved = { clientId: "c-1", version: 0, nextMutationId: 601, base: {}, pending: Array.from({ length: 600 }, (_, i) => ({ id: i + 1, name: "setVoice", args: { voice: "plain" } })) };
    const client = new SyncClient({ transport, persistence, context: ctx });
    await client.start();
    await client.idle();
    expect(sizes).toEqual([500, 100]);
    expect(client.status().waiting).toBe(0);
  });

  it("is ready once a saved copy loads or the first pull lands", async () => {
    const transport: Transport = {
      push: vi.fn(),
      pull: vi.fn(async () => ({ ok: true, status: 200, result: { version: 1, lastMutationId: 0, snapshot: true, puts: {}, dels: {} } })),
    };
    const client = new SyncClient({ transport, persistence: memoryPersistence(), context: ctx });
    expect(client.status().ready).toBe(false);
    await client.start();
    await client.idle();
    expect(client.status().ready).toBe(true);
  });
});
