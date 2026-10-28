import { describe, expect, it } from "vitest";
import { checkInWindow } from "~/server/checkin.server";
import { chicago } from "./helpers";

describe("check-in window", () => {
  it("opens Sunday at 5pm and closes Monday at noon", () => {
    expect(checkInWindow(chicago("2026-10-18", "16:59"))).toBeNull();
    expect(checkInWindow(chicago("2026-10-18", "17:00"))).toBe("2026-10-12");
    expect(checkInWindow(chicago("2026-10-19", "11:59"))).toBe("2026-10-12");
    expect(checkInWindow(chicago("2026-10-19", "12:00"))).toBeNull();
  });
});
