import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const timer = () => env.REST_TIMER.get(env.REST_TIMER.idFromName("DB"));
const ping = { binding: "DB", title: "Rest's up", body: "Set 2 of leg press" };

describe("RestTimer", () => {
  it("holds one alarm that the latest schedule sets, and cancel clears", async () => {
    const stub = timer();
    await stub.schedule(ping, 150);
    await stub.schedule(ping, 90);
    const alarm = await runInDurableObject(stub, (_o, state) => state.storage.getAlarm());
    expect(alarm).toBeGreaterThan(Date.now() + 80_000);
    expect(alarm).toBeLessThan(Date.now() + 100_000);
    await stub.cancel();
    expect(await runInDurableObject(stub, (_o, state) => state.storage.getAlarm())).toBeNull();
  });

  it("sends and forgets the ping when the alarm runs", async () => {
    const stub = timer();
    await stub.schedule(ping, 1);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await runInDurableObject(stub, (_o, state) => state.storage.get("ping"))).toBeUndefined();
  });
});
