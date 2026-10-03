# M6: Reminders, Integrations, Backups, and Launch Implementation Plan

> **For agentic workers:** implement this plan task-by-task with the `executing-plans` skill. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rocky reaches out: it installs to the iPhone Home Screen, sends web push reminders on schedule, pulls steps from the Apple Watch through a Shortcut, backs itself up weekly, and every v1 behavior is verified on the real phone.

**Architecture:** The 5-minute cron computes reminder facts for today, asks M2's `dueReminders`, records each send in `notifications_sent` before sending (so overlapping runs never double-send), and pushes with `@block65/webcrypto-web-push` (aes128gcm, which Apple requires). The service worker shows notifications, opens the right screen on tap, and caches pages for bad signal. Steps arrive through a bearer-token resource route. A weekly cron dumps every table to R2.

**Tech Stack:** As M1, plus `@block65/webcrypto-web-push` ^2.0.0.

**Prerequisite:** M1 to M5 complete and deployed. Kameron's iPhone on iOS 16.4 or later. Kameron's icon file if ready (`design/icon-1024.png`, a 1024 × 1024 PNG).

---

## File map

| Path | Responsibility |
|---|---|
| `public/manifest.webmanifest`, `public/icons/*` | Install metadata and icons |
| `public/sw.js` | Push display, notification taps, offline page cache |
| `app/root.tsx` (modify) | Register the service worker |
| `scripts/placeholder-icon.ts` | Plain placeholder icon if Kameron's is not ready |
| `app/server/push.server.ts` | Store subscriptions, send pushes, prune dead ones |
| `app/routes/api.push.subscribe.ts` | Save a subscription (signed in) |
| `app/server/reminders.server.ts` | Gather facts, pick due reminders, send |
| `app/routes/api.ingest.steps.ts` | Shortcut endpoint (bearer token) |
| `app/server/backup.server.ts` | Weekly JSON export to R2 |
| `app/jobs/scheduled.ts` (replace) | Cron dispatch |
| `app/routes/settings.tsx` (modify) | Enable notifications, test push, backup now |
| `docs/runbooks/steps-shortcut.md`, `docs/runbooks/add-recipe.md` | Runbooks |

---

### Task 1: Installable app (manifest, icons, service worker)

**Files:**
- Create: `public/manifest.webmanifest`, `public/sw.js`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/apple-touch-icon.png`, `scripts/placeholder-icon.ts` (only if needed)
- Modify: `app/root.tsx`

- [ ] **Step 1: Icons**

If `design/icon-1024.png` exists (Kameron's AI-generated icon):

```bash
mkdir -p public/icons
sips -z 512 512 design/icon-1024.png --out public/icons/icon-512.png
sips -z 192 192 design/icon-1024.png --out public/icons/icon-192.png
sips -z 180 180 design/icon-1024.png --out public/icons/apple-touch-icon.png
```

If it does not exist yet, create a plain placeholder (dark square) and tell Kameron the real icon drops into `design/icon-1024.png` later:

```ts
// scripts/placeholder-icon.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size: number, [r, g, b]: [number, number, number]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, Buffer.from([r, g, b]))]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("public/icons", { recursive: true });
for (const [name, size] of [["icon-512.png", 512], ["icon-192.png", 192], ["apple-touch-icon.png", 180]] as const) {
  writeFileSync(`public/icons/${name}`, png(size, [28, 28, 30]));
}
console.log("Placeholder icons written to public/icons/");
```

Run: `npx tsx scripts/placeholder-icon.ts`

- [ ] **Step 2: Manifest**

```json
{
  "name": "Rocky",
  "short_name": "Rocky",
  "description": "Your fitness and nutrition plan, every day.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Save as `public/manifest.webmanifest`.

- [ ] **Step 3: Service worker**

```js
// public/sw.js
const PAGES = "rocky-pages-v1";
const ASSETS = "rocky-assets-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  // iOS revokes push permission if a push does not show a notification, so always show one.
  event.waitUntil(
    self.registration.showNotification(data.title || "Rocky", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/media/exercises/")) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(PAGES).then((cache) => cache.put(req, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match("/")) || Response.error()),
    );
  }
});
```

- [ ] **Step 4: Register it** (in `app/root.tsx` `Layout`, right after `<Scripts />`)

```tsx
        <script
          dangerouslySetInnerHTML={{
            __html: `if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");`,
          }}
        />
```

The auth middleware does not block `/sw.js`, `/manifest.webmanifest`, or `/icons/*`: Workers static assets serve files in `public/` before the Worker runs.

- [ ] **Step 5: Check it**

Run: `npm run dev`, then:

```bash
curl -sI http://localhost:5173/manifest.webmanifest | grep -i content-type
curl -sI http://localhost:5173/sw.js | grep -i content-type
```

Expected: `application/manifest+json` and `text/javascript`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Make Rocky installable with a service worker"
```

---

### Task 2: Push sending

**Files:**
- Create: `app/server/push.server.ts`, `app/routes/api.push.subscribe.ts`
- Modify: `app/routes.ts`
- Test: `tests/workers/push.test.ts`

- [ ] **Step 1: Install the library**

```bash
npm install @block65/webcrypto-web-push@^2.0.0
```

(Pin 2.x: 1.x used the legacy `aesgcm` encoding, which Apple rejects.)

- [ ] **Step 2: Write the failing test**

```ts
// tests/workers/push.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { pushSubscriptions } from "~/db/schema";
import { saveSubscription, sendToAll } from "~/server/push.server";
import { db } from "./helpers";

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function vapidKeys() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publicKey = b64url((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  const privateKey = ((await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey).d!;
  return { publicKey, privateKey };
}

async function browserSubscription(endpoint: string) {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  return {
    endpoint,
    keys: { p256dh: b64url((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer), auth: b64url(crypto.getRandomValues(new Uint8Array(16)).buffer) },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("push", () => {
  it("encrypts with aes128gcm and posts to each subscription", async () => {
    await saveSubscription(db(), await browserSubscription("https://web.push.apple.com/abc"));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 201 }));
    const sent = await sendToAll(db(), { title: "Weigh-in", body: "Step on the scale.", url: "/" }, await vapidKeys());
    expect(sent).toBe(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://web.push.apple.com/abc");
    expect(new Headers((init as RequestInit).headers).get("content-encoding")).toBe("aes128gcm");
  });

  it("deletes subscriptions the push service says are gone", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 410 }));
    await sendToAll(db(), { title: "x", body: "y", url: "/" }, await vapidKeys());
    expect(await db().select().from(pushSubscriptions).all()).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run --project workers tests/workers/push.test.ts`
Expected: FAIL, cannot resolve `~/server/push.server`.

- [ ] **Step 4: Implement**

```ts
// app/server/push.server.ts
import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import type { Db } from "~/db/client";
import { pushSubscriptions } from "~/db/schema";

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export async function saveSubscription(db: Db, sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, createdAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
}

/** Sends to every stored subscription. Returns how many were accepted. */
export async function sendToAll(db: Db, message: PushMessage, vapid: VapidKeys = { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }): Promise<number> {
  const subs = await db.select().from(pushSubscriptions).all();
  let accepted = 0;
  for (const s of subs) {
    const subscription: PushSubscription = { endpoint: s.endpoint, expirationTime: null, keys: { p256dh: s.p256dh, auth: s.auth } };
    const payload = await buildPushPayload(
      { data: message, options: { ttl: 3600, urgency: "normal" } },
      subscription,
      { subject: "https://kampduh.com", publicKey: vapid.publicKey, privateKey: vapid.privateKey },
    );
    const res = await fetch(s.endpoint, payload);
    if (res.status === 404 || res.status === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint));
    else if (res.ok) accepted++;
    else console.log(`[push] ${res.status} from push service`);
  }
  return accepted;
}
```

- [ ] **Step 5: Subscribe endpoint**

```ts
// app/routes/api.push.subscribe.ts
import { env } from "cloudflare:workers";
import type { Route } from "./+types/api.push.subscribe";
import { getDb } from "~/db/client";
import { saveSubscription } from "~/server/push.server";

export async function action({ request }: Route.ActionArgs) {
  const body = (await request.json().catch(() => null)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
  if (!body?.endpoint?.startsWith("https://") || !body.keys?.p256dh || !body.keys.auth) {
    return Response.json({ error: "Bad subscription" }, { status: 400 });
  }
  await saveSubscription(getDb(env.DB), { endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } });
  return Response.json({ ok: true });
}
```

Register above `layout(...)` in `app/routes.ts`:

```ts
  route("api/push/subscribe", "routes/api.push.subscribe.ts"),
```

- [ ] **Step 6: Run the test and make sure it passes**

Run: `npx vitest run --project workers tests/workers/push.test.ts`
Expected: PASS (2 tests). If `vi.spyOn(globalThis, "fetch")` cannot replace fetch in this runtime, change `sendToAll` to accept an optional `fetcher: typeof fetch = fetch` last parameter and pass a `vi.fn()` from the test instead.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add web push sending and subscription storage"
```

---

### Task 3: Reminders on the cron

**Files:**
- Create: `app/server/reminders.server.ts`
- Test: `tests/workers/reminders.test.ts`

On relaxed days (holidays) only the check-in reminder is sent.

- [ ] **Step 1: Write the failing test**

```ts
// tests/workers/reminders.test.ts
import { describe, expect, it } from "vitest";
import { logWeighIn } from "~/server/body.server";
import { runReminders } from "~/server/reminders.server";
import type { PushMessage } from "~/server/push.server";
import { chicago, db } from "./helpers";

function collector() {
  const sent: PushMessage[] = [];
  return { sent, send: async (_db: unknown, m: PushMessage) => (sent.push(m), 1) };
}

describe("runReminders", () => {
  it("sends the weigh-in reminder once in its window", async () => {
    const c = collector();
    await runReminders(db(), chicago("2026-10-13", "07:30"), c.send);
    await runReminders(db(), chicago("2026-10-13", "07:35"), c.send);
    expect(c.sent.map((m) => m.title)).toEqual(["Weigh-in"]);
    expect(c.sent[0].url).toBe("/");
  });

  it("skips the weigh-in reminder once weighed in", async () => {
    await logWeighIn(db(), "2026-10-14", 205.8, new Date());
    const c = collector();
    await runReminders(db(), chicago("2026-10-14", "07:30"), c.send);
    expect(c.sent).toEqual([]);
  });

  it("sends Plan B on a training day afternoon with no sets", async () => {
    const c = collector();
    await runReminders(db(), chicago("2026-10-16", "17:00"), c.send);
    expect(c.sent.map((m) => m.title)).toContain("Plan B tonight");
    expect(c.sent.find((m) => m.title === "Plan B tonight")?.url).toBe("/workout?plan=b");
  });

  it("stays quiet on a holiday", async () => {
    const c = collector();
    await runReminders(db(), chicago("2026-11-26", "07:30"), c.send);
    expect(c.sent).toEqual([]);
  });
});
```

(`chicago()` uses a fixed -05:00 offset; Nov 26 is CST, so 07:30 -05:00 is 06:30 local. Use `new Date("2026-11-26T07:30:00-06:00")` for that case if the window check fails, which proves the holiday branch rather than the time window. The assertion is the same either way: nothing sent.)

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --project workers tests/workers/reminders.test.ts`
Expected: FAIL, cannot resolve `~/server/reminders.server`.

- [ ] **Step 3: Implement**

```ts
// app/server/reminders.server.ts
import { eq } from "drizzle-orm";
import { plan } from "~/content";
import type { Db } from "~/db/client";
import { notificationsSent, workoutSessions } from "~/db/schema";
import { isRelaxedDay } from "~/domain/calendar";
import { localDate, localMinutes, weekStart, weekday } from "~/domain/dates";
import { dueReminders, reminderDef, type ReminderKind } from "~/domain/reminders";
import type { Slot } from "~/domain/types";
import { stepsFor, weighInFor } from "./body.server";
import { checkInDone } from "./checkin.server";
import { datesWithSets } from "./history.server";
import { logsForDate } from "./meals.server";
import { sendToAll, type PushMessage } from "./push.server";
import { reminderSettings } from "./settings.server";
import { targetsFor } from "./targets.server";

const URLS: Record<ReminderKind, string> = {
  "weigh-in": "/",
  breakfast: "/",
  lift: "/workout",
  lunch: "/",
  snack: "/",
  "plan-b": "/workout?plan=b",
  steps: "/",
  dinner: "/",
  "kitchen-closed": "/",
  "check-in": "/check-in",
};

type Sender = (db: Db, message: PushMessage) => Promise<number>;

export async function runReminders(db: Db, now: Date, send: Sender = sendToAll): Promise<ReminderKind[]> {
  const date = localDate(now);
  const relaxed = isRelaxedDay(plan, date);
  const [logs, weighIn, steps, targets, sessions, setDates, settings, sentRows] = await Promise.all([
    logsForDate(db, date),
    weighInFor(db, date),
    stepsFor(db, date),
    targetsFor(db, date),
    db.select().from(workoutSessions).where(eq(workoutSessions.date, date)).all(),
    datesWithSets(db, date, date),
    reminderSettings(db),
    db.select().from(notificationsSent).where(eq(notificationsSent.date, date)).all(),
  ]);
  const wd = weekday(date);

  let due = dueReminders(
    localMinutes(now),
    {
      weekday: wd,
      weighedIn: weighIn !== null,
      loggedSlots: logs.filter((l) => l.slot).map((l) => l.slot as Slot),
      sessionStarted: sessions.length > 0,
      loggedSetToday: setDates.has(date),
      steps,
      stepGoal: targets.stepGoal,
      checkInDone: wd === 0 ? await checkInDone(db, weekStart(date)) : true,
    },
    settings,
    sentRows.map((r) => r.kind as ReminderKind),
  );
  if (relaxed) due = due.filter((k) => k === "check-in");

  for (const kind of due) {
    // Claim the send first so two overlapping cron runs never both send it.
    const claimed = await db.insert(notificationsSent).values({ kind, date }).onConflictDoNothing().returning();
    if (claimed.length === 0) continue;
    const def = reminderDef(kind);
    await send(db, { title: def.title, body: def.body, url: URLS[kind], tag: kind });
  }
  return due;
}
```

- [ ] **Step 4: Run the test and make sure it passes**

Run: `npx vitest run --project workers tests/workers/reminders.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Send scheduled reminders from the cron"
```

---

### Task 4: Steps ingest endpoint

**Files:**
- Create: `app/routes/api.ingest.steps.ts`
- Modify: `app/routes.ts`
- Test: `tests/workers/ingest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/workers/ingest.test.ts
import { describe, expect, it } from "vitest";
import { localDate } from "~/domain/dates";
import { action } from "~/routes/api.ingest.steps";
import { stepsFor } from "~/server/body.server";
import { db, routeArgs } from "./helpers";

const req = (body: unknown, token = "test-ingest-token") =>
  new Request("http://localhost/api/ingest/steps", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("steps ingest", () => {
  it("rejects a bad token", async () => {
    const res = (await action(routeArgs(req({ date: localDate(), steps: 100 }, "nope")))) as Response;
    expect(res.status).toBe(401);
  });

  it("upserts today's steps", async () => {
    const res = (await action(routeArgs(req({ date: localDate(), steps: 4321 })))) as Response;
    expect(res.status).toBe(200);
    expect(await stepsFor(db(), localDate())).toBe(4321);
  });

  it("accepts steps sent as a string with decimals", async () => {
    await action(routeArgs(req({ date: localDate(), steps: "5,012.0" })));
    expect(await stepsFor(db(), localDate())).toBe(5012);
  });

  it("rejects dates far from today and silly counts", async () => {
    expect(((await action(routeArgs(req({ date: "2020-01-01", steps: 10 })))) as Response).status).toBe(400);
    expect(((await action(routeArgs(req({ date: localDate(), steps: 500000 })))) as Response).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --project workers tests/workers/ingest.test.ts`
Expected: FAIL, cannot resolve `~/routes/api.ingest.steps`.

- [ ] **Step 3: Implement**

```ts
// app/routes/api.ingest.steps.ts
import { env } from "cloudflare:workers";
import type { Route } from "./+types/api.ingest.steps";
import { getDb } from "~/db/client";
import { daysBetween, localDate } from "~/domain/dates";
import { upsertSteps } from "~/server/body.server";

function tokenMatches(header: string | null): boolean {
  const enc = new TextEncoder();
  const given = enc.encode(header?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = enc.encode(env.INGEST_TOKEN);
  if (given.byteLength !== expected.byteLength) return false;
  return crypto.subtle.timingSafeEqual(given, expected);
}

export async function loader() {
  return new Response("Method not allowed", { status: 405 });
}

export async function action({ request }: Route.ActionArgs) {
  if (!tokenMatches(request.headers.get("Authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { date?: string; steps?: number | string } | null;
  const date = body?.date ?? "";
  const steps = Math.round(Number(String(body?.steps ?? "").replace(/,/g, "")));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Math.abs(daysBetween(localDate(), date)) > 2) return Response.json({ error: "Bad date" }, { status: 400 });
  if (!Number.isFinite(steps) || steps < 0 || steps > 100_000) return Response.json({ error: "Bad steps" }, { status: 400 });
  await upsertSteps(getDb(env.DB), date, steps, new Date());
  return Response.json({ ok: true, date, steps });
}
```

Register above `layout(...)`:

```ts
  route("api/ingest/steps", "routes/api.ingest.steps.ts"),
```

- [ ] **Step 4: Run the test and make sure it passes**

Run: `npx vitest run --project workers tests/workers/ingest.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add the steps ingest endpoint for the iOS Shortcut"
```

---

### Task 5: Weekly backup

**Files:**
- Create: `app/server/backup.server.ts`
- Test: `tests/workers/backup.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/workers/backup.test.ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { logWeighIn } from "~/server/body.server";
import { runBackup } from "~/server/backup.server";
import { db } from "./helpers";

describe("backup", () => {
  it("writes every table to R2 as JSON", async () => {
    await logWeighIn(db(), "2026-10-12", 205.8, new Date());
    const key = await runBackup(env.DB, env.MEDIA, new Date("2026-10-18T09:00:00Z"));
    expect(key).toBe("backups/2026-10-18.json");
    const dump = (await (await env.MEDIA.get(key))!.json()) as Record<string, unknown[]>;
    expect(dump.weigh_ins).toEqual([expect.objectContaining({ date: "2026-10-12", weight_lb: 205.8 })]);
    expect(Object.keys(dump)).toContain("meal_logs");
  });

  it("keeps only the 12 newest backups", async () => {
    for (let i = 0; i < 14; i++) await runBackup(env.DB, env.MEDIA, new Date(Date.UTC(2027, 0, 3 + i * 7, 9)));
    const listed = await env.MEDIA.list({ prefix: "backups/" });
    expect(listed.objects).toHaveLength(12);
    expect(listed.objects.map((o) => o.key)).not.toContain("backups/2026-10-18.json");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --project workers tests/workers/backup.test.ts`
Expected: FAIL, cannot resolve `~/server/backup.server`.

- [ ] **Step 3: Implement**

```ts
// app/server/backup.server.ts
const KEEP = 12;

export async function runBackup(d1: D1Database, bucket: R2Bucket, now: Date): Promise<string> {
  const { results: tables } = await d1
    .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '_cf_%' and name != 'd1_migrations' order by name")
    .all<{ name: string }>();
  const dump: Record<string, unknown[]> = {};
  for (const { name } of tables) {
    dump[name] = (await d1.prepare(`select * from "${name}"`).all()).results;
  }
  const key = `backups/${now.toISOString().slice(0, 10)}.json`;
  await bucket.put(key, JSON.stringify(dump), { httpMetadata: { contentType: "application/json" } });

  const listed = await bucket.list({ prefix: "backups/" });
  const keys = listed.objects.map((o) => o.key).sort();
  const stale = keys.slice(0, Math.max(0, keys.length - KEEP));
  if (stale.length) await bucket.delete(stale);
  return key;
}
```

- [ ] **Step 4: Run the test and make sure it passes**

Run: `npx vitest run --project workers tests/workers/backup.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add the weekly backup to R2"
```

---

### Task 6: Cron dispatch

**Files:**
- Modify: `app/jobs/scheduled.ts` (replace)
- Test: `tests/workers/scheduled.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/workers/scheduled.test.ts
import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from "cloudflare:test";
import { expect, it } from "vitest";
import worker from "../../workers/app";

it("runs the backup on the weekly cron", async () => {
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ cron: "0 9 * * SUN", scheduledTime: Date.UTC(2026, 9, 18, 9) }), env, ctx);
  await waitOnExecutionContext(ctx);
  expect(await env.MEDIA.get("backups/2026-10-18.json")).not.toBeNull();
});

it("runs reminders on the 5-minute cron without throwing", async () => {
  const ctx = createExecutionContext();
  await worker.scheduled(createScheduledController({ cron: "*/5 * * * *", scheduledTime: Date.UTC(2026, 9, 18, 3) }), env, ctx);
  await waitOnExecutionContext(ctx);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --project workers tests/workers/scheduled.test.ts`
Expected: FAIL, the backup object is missing.

- [ ] **Step 3: Implement**

```ts
// app/jobs/scheduled.ts
import { getDb } from "~/db/client";
import { runBackup } from "~/server/backup.server";
import { runReminders } from "~/server/reminders.server";

export async function runScheduled(env: Env, cron: string, now: Date): Promise<void> {
  try {
    if (cron === "0 9 * * SUN") {
      const key = await runBackup(env.DB, env.MEDIA, now);
      console.log(`[cron] backup written to ${key}`);
      return;
    }
    const sent = await runReminders(getDb(env.DB), now);
    if (sent.length) console.log(`[cron] reminders: ${sent.join(", ")}`);
  } catch (err) {
    console.log(`[cron] ${cron} failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}
```

- [ ] **Step 4: Run the test and make sure it passes**

Run: `npx vitest run --project workers tests/workers/scheduled.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Dispatch reminders and backups from the cron"
```

---

### Task 7: Settings: notifications, test push, backup now

**Files:**
- Modify: `app/routes/settings.tsx`

- [ ] **Step 1: Extend the action**

At the top of the `action` in `app/routes/settings.tsx`, before reading `kind`, add:

```ts
  const intent = form.get("intent");
  if (intent === "test-push") {
    const sent = await sendToAll(getDb(env.DB), { title: "Rocky", body: "Notifications are working.", url: "/settings", tag: "test" });
    return { pushed: sent };
  }
  if (intent === "backup") {
    return { backup: await runBackup(env.DB, env.MEDIA, new Date()) };
  }
```

Add the imports:

```ts
import { runBackup } from "~/server/backup.server";
import { sendToAll } from "~/server/push.server";
```

- [ ] **Step 2: Notifications card** (add above the "Reminders" section in the component; read `vapidPublicKey` from `loaderData`)

```tsx
      <NotificationsCard vapidPublicKey={loaderData.vapidPublicKey} />
```

and add this component at the bottom of the file:

```tsx
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function NotificationsCard({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [status, setStatus] = useState<string>("");
  const test = useFetcher<typeof action>();
  const backup = useFetcher<typeof action>();
  const installed = typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

  async function enable() {
    // iOS requires this to start directly from the tap.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return setStatus("Notifications are blocked. Turn them on in iPhone Settings > Notifications > Rocky.");
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
    const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
    setStatus(res.ok ? "Notifications on." : "Could not save the subscription. Try again.");
  }

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>Notifications</SectionTitle>
      <Card className="flex flex-col gap-3 p-[18px] text-[15px]">
        {!installed ? (
          <p className="leading-snug text-label-2">On iPhone, notifications need Rocky on the Home Screen: in Safari tap Share, then Add to Home Screen, then open Rocky from the Home Screen and come back here.</p>
        ) : (
          <button type="button" onClick={enable} className="btn-prominent h-11 rounded-full text-[16px] font-semibold">
            Enable notifications
          </button>
        )}
        {status && <p className="text-label-2">{status}</p>}
        <div className="flex flex-wrap gap-2">
          <test.Form method="post">
            <input type="hidden" name="intent" value="test-push" />
            <button type="submit" className="glass h-10 rounded-full px-4 text-[15px] font-semibold">
              Send a test
            </button>
          </test.Form>
          <backup.Form method="post">
            <input type="hidden" name="intent" value="backup" />
            <button type="submit" className="glass h-10 rounded-full px-4 text-[15px] font-semibold">
              Back up now
            </button>
          </backup.Form>
        </div>
        {test.data && "pushed" in test.data && <p className="text-label-2">Sent to {test.data.pushed} device{test.data.pushed === 1 ? "" : "s"}.</p>}
        {backup.data && "backup" in backup.data && <p className="text-label-2">Saved {backup.data.backup}.</p>}
      </Card>
    </section>
  );
}
```

- [ ] **Step 3: Typecheck and full test run**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add notification setup, test push, and manual backup to Settings"
```

---

### Task 8: Runbooks

**Files:**
- Create: `docs/runbooks/steps-shortcut.md`, `docs/runbooks/add-recipe.md`

- [ ] **Step 1: Steps Shortcut runbook**

````markdown
# Steps Shortcut (Apple Watch to Rocky)

Sends today's step total to Rocky several times a day. Health data is encrypted while the iPhone is locked, so a run that fires while locked can fail; that is fine because the next run sends the full-day total again.

## Build the Shortcut (Shortcuts app on the iPhone)

1. New Shortcut, name it **Send steps to Rocky**.
2. **Find Health Samples**: Type **Steps**, filter **Start Date is today**, **Group By Day**, Fill Missing off.
3. **Get Item from List**: First Item.
4. **Get Details of Health Sample**: **Value**.
5. **Round Number** (Normal).
6. **Date**: Current Date, then **Format Date**: Custom, `yyyy-MM-dd`.
7. **Get Contents of URL**:
   - URL: `https://kampduh.com/api/ingest/steps`
   - Method: **POST**
   - Headers: `Authorization` = `Bearer <token>` (copy it from Rocky > Settings > Steps from Apple Watch > Copy header), `Content-Type` = `application/json`
   - Request Body: **JSON**, `date` (Text) = Formatted Date, `steps` (Number) = Rounded Number
8. Run it once by hand. Rocky's steps ring should match the Health app's step count for today. If it reads higher, the samples are being double counted; check Group By Day is set.

## Automate it

Shortcuts > Automation > New > **Time of Day**: 12:00 PM, Daily, Run **Send steps to Rocky**, turn off **Ask Before Running** (iOS 17/18: **Run Immediately**). Repeat for 3:00 PM, 6:00 PM, and 9:00 PM.

On iOS 27 the flow is Edit Shortcut > Automation > Time of Day; enable **Allow Running When Locked** in the shortcut's privacy settings.

## Rotating the token

`openssl rand -hex 24 | npx wrangler secret put INGEST_TOKEN`, then paste the new header into the Shortcut.
````

- [ ] **Step 2: Recipe import runbook**

````markdown
# Adding a recipe

Kameron sends a recipe in a Claude Code session (screenshot, caption text, or link). Follow every step; the tests enforce the hard rules.

1. **Read the recipe.** List every ingredient with its amount and the number of servings.
2. **Map ingredients to foods** in `content/foods.json`.
   - Missing food: look it up in USDA FoodData Central. Prefer SR Legacy (stable ids, energy present), then Foundation. Record `fdcId`, `source`, the state it is weighed in (`raw`, `cooked`, `as-is`), kcal and protein per 100 g, and a grocery `section`. Branded sauces without an FDC entry use the label and `source: "label"`, `fdcId: null`.
   - Seasonings with negligible calories (salt, pepper, spices, garlic powder, lemon juice) go in the steps, not the ingredient list.
3. **Convert to grams in the weighed state.** Meat and fish raw, rice cooked, potatoes raw. Never leave cups or "1 chicken breast"; use grams. Add a `note` when a count helps ("3 eggs").
4. **Fix processed ingredients.** Swap seed oils for butter, olive oil, or avocado oil; swap sugary sauces for honey-based or whole-food versions; drop ultra-processed items. Mention each swap in the commit message.
5. **Pick the pool and scale one portion** to the plan's targets:

   | Pool | Calories | Protein |
   |---|---|---|
   | breakfast | ~600 (450 to 750) | 55 g+ (40 minimum) |
   | main (lunch, dinner) | ~650 (500 to 800) | 55 g+ (40 minimum) |
   | snack | 180 to 280 (150 to 300) | 20 g+ (15 minimum) |
   | dessert | under 250 (100 to 260) | any |

   Scale the protein ingredient first, then adjust carbs and fats to land the calories.
6. **Set the mode.** `any` only if every ingredient fits the weekday animal-based rules (meat, fish, eggs, dairy, fruit, honey, potatoes, rice). Anything with other vegetables, grains, or oils as a main component is `weekend`. Add `"ground-beef"` to `tags` if it uses ground beef.
7. **Write the file** `content/meals/<slug>.json` (slug = kebab-case name) with `source` set to the creator or link, and short numbered-style steps (one action per step).
8. **Run** `npx vitest run --project unit tests/unit/content.test.ts`. Fix anything out of range.
9. **Commit and push** (`Add recipe: <name> from <source>`). Workers Builds deploys it; it joins the rotation from the next generated week, and it can be swapped in today from the Meal screen.
````

- [ ] **Step 3: Commit**

```bash
git add docs/runbooks
git commit -m "Add the steps Shortcut and recipe import runbooks"
```

---

### Task 9: Launch and verify on the real phone

- [ ] **Step 1: VAPID keys**

```bash
npx web-push generate-vapid-keys --json
```

Expected: JSON with `publicKey` (base64url, 65 bytes) and `privateKey` (base64url, 32 bytes). Then:

```bash
echo "<publicKey>" | npx wrangler secret put VAPID_PUBLIC_KEY
echo "<privateKey>" | npx wrangler secret put VAPID_PRIVATE_KEY
```

Put the same pair in `.dev.vars` for local work. Never commit them.

- [ ] **Step 2: Deploy**

```bash
npm run db:migrate:remote
git push origin main
```

Wait for the Workers Build to finish green.

- [ ] **Step 3: Install and enable notifications (Kameron, on the iPhone)**

Safari > `https://kampduh.com` > Share > Add to Home Screen. Open Rocky from the Home Screen, sign in, Settings > Enable notifications > Allow, then Send a test.
Expected: the "Notifications are working." banner arrives within seconds. Tapping it opens Settings.

- [ ] **Step 4: Cron push on the wire**

In Settings, set the Weigh-in reminder time to 5 minutes from now and make sure there is no weigh-in logged today (or pick a reminder whose condition holds).
Expected: the reminder arrives within 10 minutes. Check `npx wrangler tail` shows `[cron] reminders: weigh-in`. Set the time back afterwards.

- [ ] **Step 5: Steps Shortcut**

Build the Shortcut from `docs/runbooks/steps-shortcut.md`, run it by hand.
Expected: Today's steps ring and number match the Health app.

- [ ] **Step 6: Walk a full day on the phone**

Weigh in, check off breakfast, open lunch, toggle 3 days, split a batch with a cooked weight, swap the snack, log off-plan Ranch Water, start the workout, log sets (including one in airplane mode, then reconnect), swap an exercise for today, end the workout. Today's rings, the minimum viable day card, and Rocky's message all update.

- [ ] **Step 7: Check-in and backup**

Open `/check-in?week=<this Monday>` and finish it with test values; confirm the groceries list for next week appears. In Settings, tap Back up now, then:

```bash
npx wrangler r2 object get rocky-media/backups/$(date +%F).json --remote --pipe | head -c 300
```

Expected: JSON starting with table names.

- [ ] **Step 8: Mark v1 done**

Update `docs/pre-build-checklist.md` "Ready to build when" boxes and `docs/spec.md` status to "v1 shipped" with the date. Commit and push.
