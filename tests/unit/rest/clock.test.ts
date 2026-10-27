import { describe, expect, it, vi } from "vitest";
import { RestClock, type AlarmStorage, type RestPing } from "~/rest/clock";

function memoryStorage(): AlarmStorage & { alarm: number | null; data: Map<string, unknown> } {
  const s = {
    alarm: null as number | null,
    data: new Map<string, unknown>(),
    async get<T>(k: string) {
      return s.data.get(k) as T | undefined;
    },
    async put(k: string, v: unknown) {
      s.data.set(k, v);
    },
    async delete(k: string) {
      return s.data.delete(k);
    },
    async setAlarm(t: number) {
      s.alarm = t;
    },
    async deleteAlarm() {
      s.alarm = null;
    },
  };
  return s;
}

const ping: RestPing = { binding: "DB", title: "Rest's up", body: "Set 2 of leg press" };

describe("RestClock", () => {
  it("schedules one ping, and a second schedule replaces it", async () => {
    const storage = memoryStorage();
    const clock = new RestClock(storage, () => 1_000_000, vi.fn());
    await clock.schedule(ping, 150);
    await clock.schedule({ ...ping, body: "Set 3 of leg press" }, 90);
    expect(storage.alarm).toBe(1_090_000);
    expect(storage.data.get("ping")).toEqual({ ...ping, body: "Set 3 of leg press" });
  });

  it("cancels", async () => {
    const storage = memoryStorage();
    const clock = new RestClock(storage, () => 0, vi.fn());
    await clock.schedule(ping, 60);
    await clock.cancel();
    expect(storage.alarm).toBeNull();
    expect(storage.data.has("ping")).toBe(false);
  });

  it("sends the ping once when the alarm fires, and nothing after a cancel", async () => {
    const storage = memoryStorage();
    const send = vi.fn(async () => 1);
    const clock = new RestClock(storage, () => 0, send);
    await clock.schedule(ping, 60);
    await clock.fire();
    await clock.fire();
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(ping);
    await clock.schedule(ping, 60);
    await clock.cancel();
    await clock.fire();
    expect(send).toHaveBeenCalledOnce();
  });
});
