import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stampServiceWorker } from "../../scripts/precache-sw";

const ORIGIN = "https://kampduh.com";
// sw.js as a build stamps it, for a build with one script.
const BUILT = stampServiceWorker(readFileSync(join(import.meta.dirname, "../../public/sw.js"), "utf8"), ["/assets/root-abc.js"]);
const ASSETS = `rocky-assets-${BUILT.match(/VERSION = "(\w+)"/)![1]}`;

type Req = string | { url: string };
type Handler = (event: Record<string, unknown>) => void;
const href = (r: Req) => new URL(typeof r === "string" ? r : r.url, ORIGIN).href;

const online = async (url: string) => new Response(url === `${ORIGIN}/` ? "shell" : `file ${url}`);
const offline = async (): Promise<Response> => {
  throw new TypeError("Load failed");
};

/** Runs sw.js against in-memory caches and a network the test can switch off. */
function boot(seed: Record<string, Record<string, string>> = {}) {
  const net = { fetch: online };
  const stores = new Map<string, Map<string, Response>>(
    Object.entries(seed).map(([name, files]) => [name, new Map(Object.entries(files).map(([path, body]) => [href(path), new Response(body)]))]),
  );
  const store = (name: string) => stores.get(name) ?? stores.set(name, new Map()).get(name)!;
  const caches = {
    open: async (name: string) => {
      const s = store(name);
      return {
        match: async (r: Req) => s.get(href(r))?.clone(),
        put: async (r: Req, res: Response) => void s.set(href(r), res),
        addAll: async (paths: string[]) => {
          for (const p of paths) s.set(href(p), await net.fetch(href(p)));
        },
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (r: Req) => {
      for (const s of stores.values()) {
        const hit = s.get(href(r));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };
  const handlers: Record<string, Handler> = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    registration: {},
  };
  new Function("self", "caches", "fetch", BUILT)(self, caches, (r: Req) => net.fetch(href(r)));

  async function dispatch(type: string, extra: Record<string, unknown> = {}) {
    let response: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    handlers[type]({ ...extra, respondWith: (p: Promise<Response>) => (response = p), waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    return response;
  }
  return { net, stores, dispatch };
}

const navigate = (path: string) => ({ request: { method: "GET", url: `${ORIGIN}${path}`, mode: "navigate" } });

describe("the service worker", () => {
  it("precaches the shell with the build's assets", async () => {
    const sw = boot();
    await sw.dispatch("install");
    expect([...sw.stores.get(ASSETS)!.keys()]).toEqual([`${ORIGIN}/`, `${ORIGIN}/assets/root-abc.js`]);
  });

  it("opens any path with no signal, from the precached shell", async () => {
    const sw = boot();
    await sw.dispatch("install");
    sw.net.fetch = offline;
    for (const path of ["/", "/plan", "/meal/steak-and-eggs?slot=dinner"]) {
      expect(await (await sw.dispatch("fetch", navigate(path)))!.text(), path).toBe("shell");
    }
  });

  it("takes the network's page when there is a signal, so a new deploy shows on the next open", async () => {
    const sw = boot();
    await sw.dispatch("install");
    sw.net.fetch = async () => new Response("new shell");
    expect(await (await sw.dispatch("fetch", navigate("/plan")))!.text()).toBe("new shell");
  });

  it("drops the server-rendered pages and older builds, and keeps exercise photos", async () => {
    const sw = boot({
      "rocky-pages-v1": { "/plan": "an SSR page whose scripts are gone" },
      "rocky-assets-0123456789ab": { "/assets/old.js": "old" },
      "rocky-media-v1": { "/media/exercises/Butterfly/0.jpg": "img" },
    });
    await sw.dispatch("install");
    await sw.dispatch("activate");
    expect([...sw.stores.keys()].sort()).toEqual([ASSETS, "rocky-media-v1"].sort());
  });
});
