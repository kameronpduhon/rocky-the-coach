import { describe, expect, it } from "vitest";
import { DEFAULT_REMINDERS } from "~/domain/reminders";
import { lastReceived, reminderRows, voiceOf } from "~/settings/model";

describe("settings model", () => {
  it("lists every reminder, defaults first, saved values over them", () => {
    const rows = reminderRows([{ kind: "weigh-in", enabled: 0, time: "06:45" }]);
    expect(rows).toHaveLength(DEFAULT_REMINDERS.length);
    expect(rows[0]).toEqual({ kind: "weigh-in", label: "Weigh-in", days: "Every day", enabled: false, time: "06:45" });
    expect(rows.find((r) => r.kind === "check-in")).toMatchObject({ enabled: true, days: "Sundays" });
  });

  it("reads the voice, Corner by default", () => {
    expect(voiceOf([])).toBe("corner");
    expect(voiceOf([{ id: "me", voice: "plain" }])).toBe("plain");
  });

  it("says when steps last arrived", () => {
    const now = new Date("2026-10-28T17:00:00-05:00");
    expect(lastReceived([], now)).toBeNull();
    expect(lastReceived([{ date: "2026-10-28", steps: 4200, updated_at: "2026-10-28T16:02:00.000Z" }], now)).toBe("Last received today at 11:02am.");
    expect(lastReceived([{ date: "2026-10-27", steps: 9000, updated_at: "2026-10-28T02:00:00.000Z" }], now)).toBe("Last received yesterday at 9:00pm.");
    expect(lastReceived([{ date: "2026-10-20", steps: 9000, updated_at: "2026-10-20T20:00:00.000Z" }], now)).toBe("Last received Oct 20 at 3:00pm.");
  });
});
