import { describe, expect, it } from "vitest";
import { loadSettings } from "~/settings/load";

const answer = (res: Response) => (async () => res) as unknown as typeof fetch;

describe("loadSettings", () => {
  it("returns what the server knows", async () => {
    const body = { otherName: "Catherine", ingestUrl: "https://kampduh.com/api/ingest/steps", ingestToken: "tok", vapidPublicKey: "key" };
    expect(await loadSettings(answer(Response.json(body)))).toEqual(body);
  });

  it("is null with no signal or a server error, so the screen still opens", async () => {
    const noSignal = (async () => {
      throw new TypeError("Load failed");
    }) as unknown as typeof fetch;
    expect(await loadSettings(noSignal)).toBeNull();
    expect(await loadSettings(answer(new Response(null, { status: 500 })))).toBeNull();
  });

  it("sends a signed-out person to sign in", async () => {
    const thrown = await loadSettings(answer(new Response(null, { status: 401 }))).catch((e: unknown) => e);
    expect((thrown as Response).headers.get("Location")).toBe("/login");
  });
});
