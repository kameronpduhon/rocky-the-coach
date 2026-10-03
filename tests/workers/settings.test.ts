import { describe, expect, it } from "vitest";
import { reminderSettings, saveReminder } from "~/server/settings.server";
import { db } from "./helpers";

describe("reminder settings", () => {
  it("returns defaults for every reminder until changed", async () => {
    const all = await reminderSettings(db());
    expect(all).toHaveLength(10);
    expect(all.find((r) => r.kind === "weigh-in")).toMatchObject({ enabled: true, time: "07:30" });
  });

  it("saves a change", async () => {
    await saveReminder(db(), { kind: "weigh-in", enabled: false, time: "06:45" });
    expect((await reminderSettings(db())).find((r) => r.kind === "weigh-in")).toMatchObject({ enabled: false, time: "06:45" });
  });
});
