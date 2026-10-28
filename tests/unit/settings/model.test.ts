import { describe, expect, it } from "vitest";
import { COACH_NAME } from "~/brand";
import { DEFAULT_REMINDERS } from "~/domain/reminders";
import { AI_SWITCH_COPY, aiOn, lastReceived, reminderRows, rockySection, voiceOf } from "~/settings/model";

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

  it("reads the AI switch on unless it was turned off", () => {
    expect(aiOn([])).toBe(true);
    expect(aiOn([{ id: "me", voice: "plain" }])).toBe(true);
    expect(aiOn([{ id: "me", voice: "plain", ai: 1 }])).toBe(true);
    expect(aiOn([{ id: "me", voice: "plain", ai: 0 }])).toBe(false);
  });

  it("says what the AI switch does, label reading included", () => {
    expect(AI_SWITCH_COPY).toBe(
      `Writes ${COACH_NAME}'s take, reads "Tell ${COACH_NAME}" notes and nutrition labels, and turns a described meal into a plate. Never changes your numbers. Off means written lines only.`,
    );
  });

  it("lists what Rocky knows oldest first, dating the facts accepted from a proposal", () => {
    const facts = [
      { client_id: "f-2", text: "Left shoulder sore. No overhead pressing this week.", dated: 1, created_at: "2026-10-26T02:10:00.000Z", updated_at: "2026-10-26T02:10:00.000Z" },
      { client_id: "f-1", text: "No squats or lunges.", dated: 0, created_at: "2026-10-20T15:00:00.000Z", updated_at: "2026-10-20T15:00:00.000Z" },
    ];
    expect(rockySection([{ id: "me", voice: "corner", ai: 1 }], facts, true)).toEqual({
      aiOn: true,
      setupNote: null,
      facts: [
        { key: "f-1", text: "No squats or lunges.", shown: "No squats or lunges.", forget: "Forget: No squats or lunges." },
        // 9:10pm on Oct 25 in Chicago.
        {
          key: "f-2",
          text: "Left shoulder sore. No overhead pressing this week.",
          shown: "Left shoulder sore. No overhead pressing this week. (Oct 25)",
          forget: "Forget: Left shoulder sore. No overhead pressing this week.",
        },
      ],
      empty: null,
      full: false,
    });
  });

  it("says when nothing is known yet, and when the server has no key, but not while it hasn't answered", () => {
    expect(rockySection([{ id: "me", voice: "corner", ai: 0 }], [], false)).toEqual({
      aiOn: false,
      setupNote: `Not set up on this server yet, so ${COACH_NAME} uses written lines.`,
      facts: [],
      empty: `Nothing yet. Tell ${COACH_NAME} something worth keeping in mind.`,
      full: false,
    });
    expect(rockySection([], [], null).setupNote).toBeNull();
  });

  it("is full at 30 facts", () => {
    const facts = Array.from({ length: 30 }, (_, i) => ({ client_id: `f-${i}`, text: `Fact ${i}`, dated: 0, created_at: "2026-10-20T15:00:00.000Z", updated_at: "x" }));
    expect(rockySection([], facts, true).full).toBe(true);
    expect(rockySection([], facts.slice(1), true).full).toBe(false);
  });
});
