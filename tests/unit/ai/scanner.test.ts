import { afterEach, describe, expect, it, vi } from "vitest";
import { startScanning } from "~/ai/scanner";

afterEach(() => vi.useRealTimers());

describe("startScanning", () => {
  it("looks about 5 times a second, skips a bad read, and stops at the first good code", async () => {
    vi.useFakeTimers();
    const frames = [[], [{ rawValue: "036000291453", format: "upc_a" }], [{ rawValue: "01234565", format: "upc_e" }]];
    const detect = vi.fn(async () => frames.shift() ?? []);
    const onCode = vi.fn();
    startScanning(detect, onCode);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(200);
    expect(onCode).toHaveBeenCalledExactlyOnceWith("012345000065");
    await vi.advanceTimersByTimeAsync(1000);
    expect(detect).toHaveBeenCalledTimes(3);
  });

  it("keeps going past a frame that fails to decode, and stops when told", async () => {
    vi.useFakeTimers();
    const detect = vi.fn().mockRejectedValueOnce(new Error("frame")).mockResolvedValue([]);
    const stop = startScanning(detect, vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(detect).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(detect).toHaveBeenCalledTimes(2);
  });
});
