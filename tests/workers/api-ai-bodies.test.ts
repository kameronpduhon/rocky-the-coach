import { afterEach, describe, expect, it } from "vitest";
import { fakeAi, withFakeAi } from "./fake-ai";
import { api, KAMERON, postJson } from "./helpers";

let restore = () => {};
afterEach(() => restore());

const LEGS = "wed-legs-shoulders";
const day = { date: "2026-10-28", weekday: "Wednesday", workout: "Legs, Shoulders", templateId: LEGS, logged: false };
const posted = (body: string, headers: Record<string, string> = {}): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json", ...headers }, body });

describe("AI request bodies", () => {
  it("refuses a body over 64 KB on tell, take and describe with a 413, before reading it, and asks the model nothing", async () => {
    const { client, calls } = fakeAi({});
    restore = withFakeAi(client);
    const big = JSON.stringify({ text: "x".repeat(70_000) });
    for (const path of ["/api/ai/tell", "/api/ai/take", "/api/ai/describe"]) {
      const res = await api(path, posted(big), KAMERON);
      expect(res.status).toBe(413);
    }
    // Content-Length alone is enough: the body is never read.
    expect((await api("/api/ai/describe", posted(JSON.stringify({ text: "rice" }), { "Content-Length": "70000" }), KAMERON)).status).toBe(413);
    expect(calls).toEqual([]);
  });

  it("takes a label photo up to about 7 MB, and refuses one past it with a 413", async () => {
    const { client, calls } = fakeAi({});
    restore = withFakeAi(client);
    const res = await api("/api/ai/label", posted(JSON.stringify({ image: "A".repeat(7_400_000) })), KAMERON);
    expect(res.status).toBe(413);
    // Past Anthropic's 5 MB image limit but under the body cap: the schema's own 400.
    expect((await api("/api/ai/label", posted(JSON.stringify({ image: "A".repeat(5_000_004) })), KAMERON)).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("refuses a tell context listing more than 8 templates", async () => {
    const { client, calls } = fakeAi({});
    restore = withFakeAi(client);
    const templates = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`t-${i}`, ["leg-press"]]));
    const res = await api("/api/ai/tell", postJson({ text: "Sore shoulder", today: "2026-10-27", context: { days: [day], templates } }), KAMERON);
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });
});
