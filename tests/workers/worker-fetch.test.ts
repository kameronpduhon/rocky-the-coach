import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../../workers/app";

// Stands in for the static assets: every path is a file, except under /assets/missing.
const asked: string[] = [];
const ASSETS = {
  fetch: async (input: Request | string) => {
    const path = new URL(typeof input === "string" ? input : input.url).pathname;
    asked.push(path);
    return path.startsWith("/assets/missing") ? new Response("Not found", { status: 404 }) : new Response(`asset ${path}`);
  },
};
const call = (url: string, init?: RequestInit) => worker.fetch(new Request(url, init) as never, { ...env, ASSETS } as never);

beforeEach(() => {
  asked.length = 0;
});

describe("the Worker's fetch in SPA mode", () => {
  it("hands app paths to the static assets", async () => {
    const res = await call("https://kampduh.com/progress", { headers: { "Sec-Fetch-Mode": "navigate" } });
    expect(await res.text()).toBe("asset /progress");
  });

  it("404s a data request from an older build without asking the assets", async () => {
    const res = await call("https://kampduh.com/plan.data?_routes=routes%2Fapp-layout");
    expect(res.status).toBe(404);
    expect(asked).toEqual([]);
  });

  it("answers the API and media itself, so they never fall through to the shell", async () => {
    expect((await call("https://kampduh.com/api/me")).status).toBe(401);
    expect((await call("https://kampduh.com/api/sync/pull?since=0&clientId=wirecheck1")).status).toBe(401);
    expect((await call("https://kampduh.com/api/nope")).status).toBe(404);
    expect((await call("https://kampduh.com/media/exercises/Butterfly/0.jpg")).status).toBe(401);
    expect(asked).toEqual([]);
  });

  it("sends http to https before anything else", async () => {
    const res = await call("http://kampduh.com/plan");
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("https://kampduh.com/plan");
    expect(asked).toEqual([]);
  });

  it("passes a missing file's 404 through when nothing is navigating", async () => {
    const res = await call("https://kampduh.com/assets/missing-abc.js", { headers: { "Sec-Fetch-Mode": "cors" } });
    expect(res.status).toBe(404);
  });
});
