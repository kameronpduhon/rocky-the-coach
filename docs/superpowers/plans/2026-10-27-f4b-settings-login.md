# F4b: Settings, Login and the Offline Shell Implementation Plan

> **For agentic workers:** implement this plan task-by-task with the `executing-plans` skill. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Foundation:
- **One tab at a time.** Only one tab syncs, which closes the two-tab gap where a change could be lost.
- **Settings and Login.** Both are rebuilt from the Corner mock, and Settings writes through the store.
- **Offline.** The installed app opens with no connection: the service worker precaches each build, and the layout falls back to its last answer.

**Architecture:**
- **Tab lock.** A Web Lock (`navigator.locks`) named per person decides which tab runs the sync client. Another tab shows "Open in another tab" with a button to take over.
- **Settings.** It reads voice, reminders and the last steps time from the store, and writes with `setVoice` and `setReminder`. Its server loader keeps only what the store cannot hold: the ingest token, the push key and the other person's name.
- **Service worker.** A small Vite plugin stamps `sw.js` at build with that build's asset list and a version, so each deploy installs a worker that precaches everything up front.
- **Layout loader.** A `clientLoader` on the layout stores the loader's small answer (`userId`, `name`, `hasPlan`), so moving between screens offline does not hit an error page.

**Tech Stack:** React Router 8.4, Web Locks API, IndexedDB, Vite 8 plugin hooks, Tailwind 4 with the Corner tokens, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-27-foundation-design.md`, section 2 ("Service worker"), section 4 ("Settings", "Login"), the error table, and rollout step 4. **Branch:** `v2/f4b-settings-login` (already created from `main` after F4a merged). **Mock:** artboard `Settings` on https://claude.ai/artifact/65WeReuGH5ZageJng9K6nq, minus "Rocky's AI" and "What Rocky knows", which are project 5. **Design system:** `docs/design/system.md`.

**Calls made in this plan (flag them in the PR):**
- **Settings keeps three things the mock leaves out,** each restyled:
    - **Notifications:** turning on push for a device. Catherine's phone needs it.
    - **Back up now.**
    - **The Shortcut setup steps,** folded under "How to set up the Shortcut".
- **The token field shows only its last four characters.** Copy puts the whole `Bearer <token>` header value on the clipboard, which is what the Shortcut needs.
- **Reminders without a plan.** Catherine sees "Reminders start when your plan does." in place of the rows, since the cron skips reminders for anyone without a plan.
- **The Settings loader still returns the ingest token.** The spec says rebuilt routes' loaders return nothing personal, but the token lives in `rocky-core`, which never syncs. Settings therefore needs a connection; Today does not.
- **The "signed in" line names the other person without pronouns:** "Catherine's plan, logs and check-ins are kept separately."
- **A second tab waits half a second for the lock** before it says "Open in another tab". It takes over on its own when the first tab closes.
- **Another person's data is removed when someone else signs in.** The person's IndexedDB copy, waiting changes included, is deleted the next time a different person opens the app on that device (spec: "A different user's sign-in clears the queue").

---

## Ground rules

- Everything from earlier F plans applies:
    - No em dashes in code, copy, commits or docs.
    - No `Co-Authored-By` lines.
    - Look with `npm run dev`.
    - One full `npm run typecheck && npm test` at the end.
    - Token colours only. Red only for the primary action and live state.
- Browser-run modules (`app/sync/tab-lock.ts`, `app/settings/model.ts`, `app/ui/*`) import nothing from `cloudflare:workers` or `*.server.ts`.
- Store rows are raw D1 rows: snake_case, booleans as `0`/`1`.

---

### Task 1: One tab syncs at a time

**Files:**
- Create: `app/sync/tab-lock.ts`
- Modify: `app/sync/client.ts`, `app/sync/idb.ts`, `app/sync/react.tsx`
- Test: `tests/unit/sync/tab-lock.test.ts`, `tests/unit/sync/client.test.ts`

The bug: two tabs share one saved copy and one change counter, so both can number a change 5. The server applies the first and skips the second as already done, which loses it silently.

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/sync/tab-lock.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimSync, type LockLike } from "~/sync/tab-lock";

/** Enough of the Web Locks API for one exclusive lock: queueing, abort, and steal. */
class FakeLocks implements LockLike {
  private holder: ((e: unknown) => void) | null = null;
  private queue: (() => void)[] = [];

  request(_name: string, opts: { steal?: boolean; signal?: AbortSignal }, cb: (lock: unknown) => Promise<void>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const grant = () => {
        this.holder = reject;
        cb({}).then(() => {
          if (this.holder !== reject) return resolve();
          this.holder = null;
          resolve();
          this.queue.shift()?.();
        }, reject);
      };
      if (!this.holder) grant();
      else if (opts.steal) {
        this.holder(new DOMException("stolen", "AbortError"));
        grant();
      } else {
        this.queue.push(grant);
        opts.signal?.addEventListener("abort", () => {
          this.queue = this.queue.filter((g) => g !== grant);
          reject(new DOMException("aborted", "AbortError"));
        });
      }
    });
  }
}

const tab = () => ({ held: vi.fn(), elsewhere: vi.fn() });

describe("claimSync", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("holds the lock when no other tab has it", async () => {
    const a = tab();
    claimSync(new FakeLocks(), "rocky-sync-1", false, a);
    await vi.advanceTimersByTimeAsync(600);
    expect(a.held).toHaveBeenCalledOnce();
    expect(a.elsewhere).not.toHaveBeenCalled();
  });

  it("says elsewhere when another tab holds it, and takes over when that tab lets go", async () => {
    const locks = new FakeLocks();
    const a = tab();
    const b = tab();
    const releaseA = claimSync(locks, "rocky-sync-1", false, a);
    claimSync(locks, "rocky-sync-1", false, b);
    await vi.advanceTimersByTimeAsync(600);
    expect(b.elsewhere).toHaveBeenCalledOnce();
    releaseA();
    await vi.advanceTimersByTimeAsync(0);
    expect(b.held).toHaveBeenCalledOnce();
  });

  it("takes the lock when asked, and tells the other tab", async () => {
    const locks = new FakeLocks();
    const a = tab();
    const b = tab();
    claimSync(locks, "rocky-sync-1", false, a);
    await vi.advanceTimersByTimeAsync(0);
    claimSync(locks, "rocky-sync-1", true, b);
    await vi.advanceTimersByTimeAsync(0);
    expect(b.held).toHaveBeenCalledOnce();
    expect(a.elsewhere).toHaveBeenCalledOnce();
  });

  it("just holds where the browser has no Web Locks", () => {
    const a = tab();
    claimSync(undefined, "rocky-sync-1", false, a);
    expect(a.held).toHaveBeenCalledOnce();
  });
});
```

In `tests/unit/sync/client.test.ts`, add inside the `describe`:

```ts
  it("does nothing once stopped, so a tab that lost the lock cannot write", async () => {
    const transport: Transport = {
      push: vi.fn(async () => ({ ok: true, status: 200, result: { lastMutationId: 0, rejected: [] } })),
      pull: vi.fn(async () => ({ ok: true, status: 200, result: { version: 1, lastMutationId: 0, snapshot: true, puts: {}, dels: {} } })),
    };
    const persistence = memoryPersistence();
    const client = new SyncClient({ transport, persistence, context: ctx });
    await client.start();
    await client.idle();
    client.stop();
    const before = persistence.saved;
    expect(await client.mutate("setVoice", { voice: "plain" })).toBe(false);
    await client.sync();
    expect(transport.push).not.toHaveBeenCalled();
    expect(persistence.saved).toBe(before);
  });
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/sync/tab-lock.test.ts tests/unit/sync/client.test.ts
```

Expected: the tab-lock file fails to import `~/sync/tab-lock`, and the stop test fails because `mutate` returns `true`.

- [ ] **Step 3: Write `app/sync/tab-lock.ts`:**

```ts
// Only one tab may run the sync client: two would share one change counter and could each number a change 5,
// and the server would skip the second as already applied.

export interface LockLike {
  request(name: string, options: { steal?: boolean; signal?: AbortSignal }, callback: (lock: unknown) => Promise<void>): Promise<void>;
}

const ELSEWHERE_AFTER_MS = 500;

/**
 * Claims the right to sync for this tab. `held` runs when this tab has it. `elsewhere` runs when another tab has
 * held it for half a second, or takes it. Waiting continues in the background, so closing the other tab hands it
 * over. Returns a release for unmount.
 */
export function claimSync(locks: LockLike | undefined, name: string, steal: boolean, on: { held(): void; elsewhere(): void }): () => void {
  if (!locks) {
    on.held();
    return () => undefined;
  }
  let release: () => void = () => undefined;
  const holding = new Promise<void>((resolve) => (release = resolve));
  const abort = new AbortController();
  let granted = false;
  const waiting = setTimeout(() => !granted && on.elsewhere(), ELSEWHERE_AFTER_MS);
  locks
    .request(name, steal ? { steal: true } : { signal: abort.signal }, async () => {
      granted = true;
      clearTimeout(waiting);
      on.held();
      await holding;
    })
    .catch(() => {
      clearTimeout(waiting);
      // Our own unmount aborts a wait; anything else means another tab took the lock.
      if (!abort.signal.aborted) on.elsewhere();
    });
  return () => {
    clearTimeout(waiting);
    abort.abort();
    release();
  };
}
```

- [ ] **Step 4: Make a stopped client inert.** In `app/sync/client.ts`:

1. Add a field under `retryTimer`: `private stopped = false;`.
2. At the top of `mutate`, add `if (this.stopped) return false;`.
3. At the top of `sync()`, add `if (this.stopped) return Promise.resolve();`.
4. At the top of `persist()`, add `if (this.stopped) return;`.
5. Replace `stop()` with:

```ts
  /** Stops for good: no more rounds, retries or saves. Called on unmount, or when another tab takes over. */
  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
```

- [ ] **Step 5: Forget other people's copies.** Add to the end of `app/sync/idb.ts`:

```ts
/** A different person signing in on this device removes the last person's saved copy and any unsent changes. */
export async function forgetOtherPeople(userId: number): Promise<void> {
  const dbs = (await indexedDB.databases?.().catch(() => [])) ?? [];
  for (const { name } of dbs) {
    if (name?.startsWith("rocky-sync-") && name !== `rocky-sync-${userId}`) indexedDB.deleteDatabase(name);
  }
}
```

- [ ] **Step 6: Run the provider only while holding the lock.** In `app/sync/react.tsx`:

1. Change the idb import to `import { forgetOtherPeople, idbPersistence } from "./idb";`, and add `import { claimSync } from "./tab-lock";` and `import { btn } from "~/ui/button";`.
2. Replace `SyncProvider` with:

```tsx
/** Starts the person's sync client in the browser, in one tab at a time. Nothing waits on sync. */
export function SyncProvider({ userId, children }: { userId: number; children: React.ReactNode }) {
  const [client, setClient] = useState<SyncClient | null>(null);
  const [elsewhere, setElsewhere] = useState(false);
  // Each "Use Rocky here" tap bumps this, which re-claims the lock with steal.
  const [takeovers, setTakeovers] = useState(0);
  useEffect(() => {
    let running: SyncClient | null = null;
    let stopListening: () => void = () => {};
    const shutdown = () => {
      stopListening();
      running?.stop();
      running = null;
      setClient(null);
    };
    const release = claimSync(navigator.locks, `rocky-sync-${userId}`, takeovers > 0, {
      held() {
        setElsewhere(false);
        const c = createClient(userId);
        running = c;
        void c.start();
        void navigator.storage?.persist?.().catch(() => undefined);
        void forgetOtherPeople(userId);
        const resync = () => document.visibilityState === "visible" && void c.sync();
        const timer = window.setInterval(resync, 60_000);
        document.addEventListener("visibilitychange", resync);
        window.addEventListener("online", resync);
        stopListening = () => {
          window.clearInterval(timer);
          document.removeEventListener("visibilitychange", resync);
          window.removeEventListener("online", resync);
        };
        setClient(c);
      },
      elsewhere() {
        shutdown();
        setElsewhere(true);
      },
    });
    return () => {
      release();
      shutdown();
    };
  }, [userId, takeovers]);
  // Pull on every navigation, so a v1 screen's server action (a set, a swap) shows on the next screen at once.
  const { key } = useLocation();
  useEffect(() => {
    void client?.sync();
  }, [client, key]);
  if (elsewhere) return <OpenElsewhere onUseHere={() => setTakeovers((n) => n + 1)} />;
  return <SyncContext.Provider value={client}>{children}</SyncContext.Provider>;
}

function OpenElsewhere({ onUseHere }: { onUseHere: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col justify-center gap-4 px-5">
      <h1 className="font-display text-[48px] uppercase leading-none">Open in another tab.</h1>
      <p className="text-[17px] leading-[1.45] text-ink-2">Rocky keeps one copy in step at a time, so changes never cross. Close the other tab, or use Rocky here.</p>
      <button type="button" onClick={onUseHere} className={`${btn.primary} h-14`}>
        Use Rocky here
      </button>
    </main>
  );
}
```

If typecheck rejects `navigator.locks` as a `LockLike` (the DOM types return `Promise<T>` from an overloaded `request`), pass `navigator.locks as unknown as LockLike` and import the type.

- [ ] **Step 7: Run the tests again.** Same command as Step 2. Expected: PASS.

- [ ] **Step 8: Check it in dev with two tabs.**
1. Open `/` in two Chrome tabs. The second shows "Open in another tab." within a second.
2. Tap "Use Rocky here". The second tab shows Today, and the first switches to the notice.
3. Close the tab that has Today. The other one takes over on its own within a second.

React's StrictMode runs the effect twice in dev. The first claim is released before the second, so a single tab must never show the notice. If it does, say so in the report.

- [ ] **Step 9: Commit.**

```bash
git add app/sync/tab-lock.ts app/sync/client.ts app/sync/idb.ts app/sync/react.tsx tests/unit/sync/tab-lock.test.ts tests/unit/sync/client.test.ts
git commit -m "Sync in one tab at a time, so two tabs can never reuse a change number"
```

---

### Task 2: What Settings reads from the store

**Files:**
- Create: `app/settings/model.ts`
- Test: `tests/unit/settings/model.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/settings/model.test.ts`:

```ts
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
```

Check `REMINDER_LABEL["weigh-in"]` in `app/domain/reminders.ts`. If it is not "Weigh-in", use its real value in the first expectation.

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/settings/model.test.ts
```

Expected: FAIL with "Failed to resolve import "~/settings/model"".

- [ ] **Step 3: Write `app/settings/model.ts`:**

```ts
import { addDays, formatClock, localDate, localMinutes, TZ } from "~/domain/dates";
import { DEFAULT_REMINDERS, REMINDER_LABEL, type ReminderKind } from "~/domain/reminders";
import type { Row } from "~/sync/tables";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: TZ });

export function daysLabel(days: number[]): string {
  if (days.length === 7) return "Every day";
  if (days.length === 1) return days[0] === 0 ? "Sundays" : `${DAY_NAMES[days[0]]}s`;
  return days.map((d) => DAY_NAMES[d]).join(", ");
}

export interface ReminderRow {
  kind: ReminderKind;
  label: string;
  days: string;
  enabled: boolean;
  time: string;
}

/** Every reminder in plan order. A saved row overrides its default; a reminder never saved is on at its default time. */
export function reminderRows(rows: Row[]): ReminderRow[] {
  return DEFAULT_REMINDERS.map((d) => {
    const saved = rows.find((r) => r.kind === d.kind);
    return { kind: d.kind, label: REMINDER_LABEL[d.kind], days: daysLabel(d.days), enabled: saved ? Boolean(saved.enabled) : true, time: (saved?.time as string | undefined) ?? d.time };
  });
}

export function voiceOf(rows: Row[]): "corner" | "plain" {
  return rows.find((r) => r.id === "me")?.voice === "plain" ? "plain" : "corner";
}

/** When the steps Shortcut last delivered, from the newest steps row. */
export function lastReceived(rows: Row[], now: Date): string | null {
  const latest = rows
    .map((r) => r.updated_at)
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .sort()
    .at(-1);
  if (!latest) return null;
  const at = new Date(latest);
  const day = localDate(at);
  const today = localDate(now);
  const when = day === today ? "today" : day === addDays(today, -1) ? "yesterday" : MONTH_DAY.format(at);
  return `Last received ${when} at ${formatClock(localMinutes(at))}.`;
}
```

- [ ] **Step 4: Run the test again.** Same command. Expected: PASS, 3 tests.

- [ ] **Step 5: Commit.**

```bash
git add app/settings/model.ts tests/unit/settings/model.test.ts
git commit -m "Read Settings' voice, reminders and last steps time from the phone's copy"
```

---

### Task 3: The Settings screen

**Files:**
- Modify: `app/routes/settings.tsx` (full rewrite)
- Modify: `tests/workers/settings-route.test.ts`

- [ ] **Step 1: Update the route test first.** In `tests/workers/settings-route.test.ts`:

1. Change the import to `import { action, loader } from "~/routes/settings";`.
2. Replace the "still saves reminder changes" test with:

```ts
  it("leaves reminder changes to the store", async () => {
    expect(await action(routeArgs(post("http://localhost/settings", { kind: "weigh-in", enabled: "true", time: "06:45" })))).toEqual({ error: "Unknown action" });
  });

  it("names the other person and gives the ingest address", async () => {
    const data = await loader(routeArgs(new Request("http://localhost/settings")));
    expect(data).toMatchObject({ name: "Kameron", otherName: "Catherine", hasPlan: true, ingestUrl: "http://localhost/api/ingest/steps" });
  });
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project workers tests/workers/settings-route.test.ts
```

Expected: the two new tests fail. The action still saves reminders, and the loader has no `otherName`.

- [ ] **Step 3: Replace `app/routes/settings.tsx` with:**

```tsx
import { env } from "cloudflare:workers";
import { useEffect, useState, type ReactNode } from "react";
import { Form, Link, useFetcher } from "react-router";
import type { Route } from "./+types/settings";
import { Toggle } from "~/components/Toggle";
import { Icon } from "~/components/ui";
import { runBackup } from "~/server/backup.server";
import { serverNow } from "~/server/clock.server";
import { currentUser, userDb } from "~/server/current-user.server";
import { sendToAll } from "~/server/push.server";
import { allUsers } from "~/server/users.server";
import { lastReceived, reminderRows, voiceOf, type ReminderRow } from "~/settings/model";
import { useMutate, useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";
import { btn } from "~/ui/button";
import { SectionHead } from "~/ui/SectionHead";

export const handle = { hideTabBar: true };

export function meta() {
  return [{ title: "Settings · Rocky" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = currentUser();
  const other = (await allUsers()).find((u) => u.id !== user.id) ?? null;
  return {
    name: user.name,
    otherName: other?.name ?? null,
    hasPlan: Boolean(user.planKey),
    ingestUrl: `${new URL(request.url).origin}/api/ingest/steps`,
    // Kameron's Shortcut still sends the v1 INGEST_TOKEN until he switches it to his own token.
    ingestToken: user.ingestToken ?? (user.dbBinding === "DB" ? env.INGEST_TOKEN : null),
    vapidPublicKey: env.VAPID_PUBLIC_KEY,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "test-push") {
    const pushed = await sendToAll(userDb(), { title: "Rocky", body: "Notifications are working.", url: "/settings", tag: "test" });
    return { pushed };
  }
  if (intent === "backup") {
    const user = currentUser();
    return { backup: await runBackup(env[user.dbBinding], env.MEDIA, serverNow(), user.name.toLowerCase()) };
  }
  return { error: "Unknown action" };
}

export default function Settings({ loaderData }: Route.ComponentProps) {
  const { name, otherName, hasPlan, ingestUrl, ingestToken, vapidPublicKey } = loaderData;
  const client = useSyncClient();
  const ready = useSyncStatus()?.ready ?? false;
  useStoreVersion();
  const rows = (table: string) => (client && ready ? client.store.rows(table) : []);

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-[26px] px-5 pb-12 pt-[max(16px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3.5">
        <Link to="/" aria-label="Back to Today" className="flex size-11 flex-none items-center justify-center rounded-[6px] border-[1.5px] border-border">
          <Icon name="back" size={18} strokeWidth={2.4} />
        </Link>
        <h1 className="font-display text-[48px] uppercase leading-none">Settings.</h1>
      </header>

      <div className="flex flex-col rounded-[6px] border-[1.5px] border-ink p-3.5">
        <span className="text-[17px] font-bold">Signed in as {name}</span>
        {otherName && <span className="text-[14px] text-ink-3">{otherName}'s plan, logs and check-ins are kept separately.</span>}
      </div>

      <section aria-labelledby="rocky" className="flex flex-col gap-3.5">
        <SectionHead id="rocky">Rocky</SectionHead>
        {ready && <VoicePicker voice={voiceOf(rows("profile"))} />}
      </section>

      <section aria-labelledby="reminders" className="flex flex-col">
        <div className="mb-1">
          <SectionHead id="reminders">Reminders</SectionHead>
        </div>
        {!hasPlan ? (
          <p className="pt-2 text-[15px] leading-[1.4] text-ink-2">Reminders start when your plan does.</p>
        ) : (
          ready && (
            <>
              {reminderRows(rows("reminder_settings")).map((r) => (
                <ReminderLine key={r.kind} r={r} />
              ))}
              <p className="mt-2.5 text-[14px] leading-[1.4] text-ink-3">Each one is skipped if it's already done. Times are Central.</p>
            </>
          )
        )}
      </section>

      <NotificationsSection vapidPublicKey={vapidPublicKey} />

      <section aria-labelledby="steps" className="flex flex-col gap-2.5">
        <SectionHead id="steps">Steps from your iPhone</SectionHead>
        <p className="text-[15px] leading-[1.4] text-ink-2">
          An iPhone Shortcut sends your steps four times a day. {(ready && lastReceived(rows("steps_daily"), new Date())) || "Nothing received yet."}
        </p>
        <CopyField shown={ingestUrl.replace(/^https?:\/\//, "")} copy={ingestUrl} label="Copy the steps address" />
        {ingestToken ? (
          <CopyField shown={`Token ••••••••••••${ingestToken.slice(-4)}`} copy={`Bearer ${ingestToken}`} label="Copy the Authorization header" />
        ) : (
          <p className="text-[15px] text-ink-3">No token yet.</p>
        )}
        <ShortcutSteps />
      </section>

      <BackupSection />

      <SyncLine />

      <Form method="post" action="/logout">
        <button type="submit" className={btn.quiet}>
          Sign out
        </button>
      </Form>
    </main>
  );
}

const VOICES = [
  { value: "corner", name: "In your corner", note: "Straight shooter, a little fight" },
  { value: "plain", name: "Plain", note: "Same advice, no boxing talk" },
] as const;

function VoicePicker({ voice }: { voice: "corner" | "plain" }) {
  const mutate = useMutate();
  return (
    <div className="flex flex-col gap-2">
      <span id="voice" className="text-[16px] font-bold">
        How Rocky talks
      </span>
      <div role="radiogroup" aria-labelledby="voice" className="grid grid-cols-2 gap-2">
        {VOICES.map((v) => {
          const on = v.value === voice;
          return (
            <button
              key={v.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => !on && void mutate("setVoice", { voice: v.value })}
              className={`min-h-16 rounded-[6px] px-2.5 py-2 text-left ${on ? "border-2 border-ink bg-ink text-paper" : "border-[1.5px] border-border text-ink"}`}
            >
              <span className="block font-num text-[16px] font-bold">{v.name}</span>
              <span className={`block text-[13px] ${on ? "text-on-ink-2" : "text-ink-3"}`}>{v.note}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReminderLine({ r }: { r: ReminderRow }) {
  const mutate = useMutate();
  const save = (enabled: boolean, time: string) => void mutate("setReminder", { kind: r.kind, enabled, time });
  return (
    <div className="flex min-h-[54px] items-center gap-3 border-b border-rule">
      <span className="flex flex-1 flex-col">
        <span className="text-[16px]">{r.label}</span>
        {r.days !== "Every day" && <span className="text-[13px] text-ink-3">{r.days}</span>}
      </span>
      <label className="sr-only" htmlFor={`time-${r.kind}`}>
        {r.label} time
      </label>
      <input
        id={`time-${r.kind}`}
        type="time"
        value={r.time}
        disabled={!r.enabled}
        onChange={(e) => e.target.value && save(r.enabled, e.target.value)}
        className="tabular h-11 w-[92px] flex-none bg-transparent text-right font-num text-[16px] font-bold text-ink disabled:text-ink-3 [&::-webkit-calendar-picker-indicator]:hidden"
      />
      <Toggle on={r.enabled} label={`${r.label} reminder`} onChange={(next) => save(next, r.time)} />
    </div>
  );
}

function CopyField({ shown, copy, label }: { shown: string; copy: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-h-12 items-center gap-2.5 rounded-[6px] border-[1.5px] border-border bg-field pl-3">
      <span className="flex-1 truncate font-num text-[15px] font-semibold text-ink-2">{shown}</span>
      <button
        type="button"
        aria-label={label}
        onClick={async () => {
          await navigator.clipboard.writeText(copy);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="h-11 flex-none px-3 text-[15px] font-bold underline underline-offset-[3px]"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function ShortcutSteps() {
  return (
    <details className="group">
      <summary className={`${btn.quiet} cursor-pointer list-none`}>How to set up the Shortcut</summary>
      <ol className="mt-2 flex flex-col gap-3 text-[15px] leading-[1.45] text-ink-2">
        <Step n={1}>
          New Shortcut named <span className="font-semibold text-ink">Send steps to Rocky</span>. Add Find Health Samples: Steps, Start Date is today, Group By Day. Leave Source unfiltered; Group By Day merges iPhone and Watch without double counting. Then Get Item from List (First Item), Get Details of Health Sample (Value), and Round Number.
        </Step>
        <Step n={2}>Add Date (Current Date), then Format Date with the custom format yyyy-MM-dd.</Step>
        <Step n={3}>
          Add Get Contents of URL. Method POST, the address above, a header named Authorization with the copied header value, and a JSON request body with <span className="font-mono text-[14px] text-ink">date</span> set to the formatted date and{" "}
          <span className="font-mono text-[14px] text-ink">steps</span> set to the rounded number.
        </Step>
        <Step n={4}>Run it once by hand. Steps on Today should match the Health app.</Step>
        <Step n={5}>In Automation, add a daily Time of Day automation at noon that runs Send steps to Rocky with Run Immediately on. Repeat for 3, 6, and 9 PM.</Step>
      </ol>
    </details>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="tabular w-4 flex-none font-num font-bold text-ink">
        {n}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

function SyncLine() {
  const s = useSyncStatus();
  if (!s) return null;
  const when = s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  const text = !s.online
    ? `Sync: offline, ${s.waiting} change${s.waiting === 1 ? "" : "s"} waiting`
    : s.waiting
      ? `Sync: sending ${s.waiting} change${s.waiting === 1 ? "" : "s"}`
      : `Sync: up to date${when ? `, ${when}` : ""}`;
  return <p className="text-[13px] text-ink-3">{text}</p>;
}

function BackupSection() {
  const backup = useFetcher<typeof action>();
  const saved = backup.data && "backup" in backup.data ? backup.data.backup : null;
  return (
    <section aria-labelledby="backups" className="flex flex-col gap-2.5">
      <SectionHead id="backups">Backups</SectionHead>
      <p className="text-[15px] leading-[1.4] text-ink-2">Early every Sunday Rocky saves a copy of all your logs and keeps the last 12.</p>
      <backup.Form method="post" className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="intent" value="backup" />
        <button type="submit" disabled={backup.state !== "idle"} className={`${btn.outlinePlain} h-11 px-4`}>
          {backup.state !== "idle" ? "Backing up" : "Back up now"}
        </button>
        {saved && (
          <span aria-live="polite" className="text-[15px] text-ink-3">
            Saved <span className="tabular font-mono text-[14px]">{saved.replace(/^backups\//, "")}</span>
          </span>
        )}
      </backup.Form>
    </section>
  );
}
```

- [ ] **Step 4: Bring the notifications section over.** Copy `urlBase64ToUint8Array`, `PushState`, `detectPush`, `saveSubscription` and `NotificationsSection` from the old `settings.tsx` (`git show main:app/routes/settings.tsx`) to the end of the new file, unchanged except for these style edits:

1. The outer `<section aria-label="Notifications" ...>` becomes `<section aria-labelledby="notifications" className="flex flex-col gap-2.5">` with `<SectionHead id="notifications">Notifications</SectionHead>` as its first child. Delete the old `SectionTitle` and the `Card` wrapper, keeping the card's children.
2. Every `text-label-2` becomes `text-ink-2`, and every `px-1` on paragraphs goes.
3. The "Turn on" button's class becomes ``${btn.primary} h-11 flex-none px-4 disabled:opacity-60``.
4. The "Send a test" button's class becomes ``${btn.outlinePlain} h-11 px-4``.

- [ ] **Step 5: Run the route test again.** Same command as Step 2. Expected: PASS. Then typecheck:

```bash
npm run typecheck
```

`app/server/settings.server.ts` still serves the reminder cron, so keep it.

- [ ] **Step 6: Commit.**

```bash
git add app/routes/settings.tsx tests/workers/settings-route.test.ts
git commit -m "Rebuild Settings from the Corner mock on the phone's copy"
```

---

### Task 4: The Login screen

**Files:**
- Modify: `app/routes/login.tsx` (component only; the action is unchanged)

- [ ] **Step 1: Replace the default export in `app/routes/login.tsx`** and add `import { btn } from "~/ui/button";`:

```tsx
const FIELD = "h-[52px] rounded-[6px] border-[1.5px] border-border bg-field px-4 text-[17px] text-ink";

export default function Login({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col justify-center gap-8 px-5 py-12">
      <h1 className="font-display text-[68px] uppercase leading-[0.92]">Rocky.</h1>
      <Form method="post" reloadDocument className="flex flex-col gap-3">
        <label htmlFor="name" className="text-[13px] font-semibold text-ink-3">
          Name
        </label>
        <input id="name" name="name" autoComplete="username" autoCapitalize="words" required className={FIELD} />
        <label htmlFor="password" className="mt-1 text-[13px] font-semibold text-ink-3">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={FIELD} />
        {actionData?.error && (
          <p role="alert" className="text-[15px] font-semibold text-ink-2">
            {actionData.error}
          </p>
        )}
        <button type="submit" disabled={busy} className={`${btn.primary} mt-2 h-14 disabled:opacity-60`}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </Form>
    </main>
  );
}
```

- [ ] **Step 2: Run the login test.**

```bash
npx vitest run --project workers tests/workers/login.test.ts
```

Expected: PASS (only markup changed).

- [ ] **Step 3: Commit.**

```bash
git add app/routes/login.tsx
git commit -m "Corner sign-in screen"
```

---

### Task 5: The service worker precaches each build

**Files:**
- Create: `scripts/precache-sw.ts`
- Modify: `vite.config.ts`, `public/sw.js`
- Test: `tests/unit/precache-sw.test.ts`

- [ ] **Step 1: Write the failing test.** Create `tests/unit/precache-sw.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stampServiceWorker } from "../../scripts/precache-sw";

const SRC = 'const VERSION = "dev";\nconst PRECACHE = [];\nself.addEventListener("install", () => {});\n';

describe("stampServiceWorker", () => {
  it("writes the build's assets and a version into the worker", () => {
    const out = stampServiceWorker(SRC, ["/assets/b.js", "/assets/a.css"]);
    expect(out).toContain('const PRECACHE = ["/assets/a.css","/assets/b.js"];');
    expect(out).toMatch(/const VERSION = "[0-9a-f]{12}";/);
  });

  it("changes the version when the assets change, so phones install the new worker", () => {
    const version = (s: string) => s.match(/VERSION = "(\w+)"/)![1];
    expect(version(stampServiceWorker(SRC, ["/assets/a.js"]))).not.toBe(version(stampServiceWorker(SRC, ["/assets/b.js"])));
  });

  it("fails the build if sw.js lost its markers", () => {
    expect(() => stampServiceWorker("self.x = 1;", [])).toThrow("sw.js is missing");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails.**

```bash
npx vitest run --project unit tests/unit/precache-sw.test.ts
```

Expected: FAIL, because the module does not exist.

- [ ] **Step 3: Write `scripts/precache-sw.ts`:**

```ts
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

const VERSION_LINE = 'const VERSION = "dev";';
const PRECACHE_LINE = "const PRECACHE = [];";

/** Puts the build's asset list and a version into sw.js. The bytes change with every build, so phones install it. */
export function stampServiceWorker(src: string, files: string[]): string {
  if (!src.includes(VERSION_LINE) || !src.includes(PRECACHE_LINE)) throw new Error("sw.js is missing its VERSION or PRECACHE line");
  const list = [...files].sort();
  const version = createHash("sha256").update(list.join("\n")).digest("hex").slice(0, 12);
  return src.replace(VERSION_LINE, `const VERSION = "${version}";`).replace(PRECACHE_LINE, `const PRECACHE = ${JSON.stringify(list)};`);
}

/** After the client build is written, stamps the copied public/sw.js with every hashed script, style and font. */
export function precacheServiceWorker(): Plugin {
  return {
    name: "rocky-precache-sw",
    applyToEnvironment: (environment) => environment.name === "client",
    writeBundle(options, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => /^assets\/.+\.(js|css|woff2)$/.test(f))
        .map((f) => `/${f}`);
      const path = join(options.dir!, "sw.js");
      writeFileSync(path, stampServiceWorker(readFileSync(path, "utf8"), files));
    },
  };
}
```

- [ ] **Step 4: Run the test again.** Same command. Expected: PASS, 3 tests.

- [ ] **Step 5: Use the plugin.** In `vite.config.ts`, add `import { precacheServiceWorker } from "./scripts/precache-sw";` and put `precacheServiceWorker(),` last in `plugins`.

- [ ] **Step 6: Precache at install, and clean up old builds.** In `public/sw.js`, replace the first two lines (`const PAGES ...` and `const ASSETS ...`) and the `install` and `activate` listeners with:

```js
// The build stamps VERSION and PRECACHE (scripts/precache-sw.ts). In dev both stay empty, and assets cache as they load.
const VERSION = "dev";
const PRECACHE = [];
const PAGES = "rocky-pages-v1";
const ASSETS = `rocky-assets-${VERSION}`;
// Exercise photos outlive builds, so they keep their own cache.
const MEDIA = "rocky-media-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(ASSETS)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("rocky-assets-") && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
```

Then in the `fetch` listener, split the cache-first branch, so media goes to `MEDIA` and `/assets/` goes to `ASSETS`. Use the same cache-first body for both, changing only the cache name:

```js
  const cacheFirst = (name) =>
    event.respondWith(
      caches.open(name).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
  if (url.pathname.startsWith("/assets/")) return cacheFirst(ASSETS);
  if (url.pathname.startsWith("/media/exercises/")) return cacheFirst(MEDIA);
```

Leave the push, notification click and navigation handlers as they are.

- [ ] **Step 7: Check the stamp in a real build.** This checks a build artifact, not the look:

```bash
npm run build && head -c 400 build/client/sw.js && grep -c '"/assets/' build/client/sw.js
```

Expected: `VERSION` is a 12-character hex string, and `PRECACHE` lists `/assets/...` files, woff2 included. If `sw.js` still says `"dev"`, either the client environment has a different name or `public/` is copied after `writeBundle`:
1. Log `this.environment.name` inside the hook to see which it is.
2. If the name is the problem, match the real name. If the copy order is, move the work to `closeBundle`.
3. Say which in the report.

- [ ] **Step 8: Commit.**

```bash
git add scripts/precache-sw.ts vite.config.ts public/sw.js tests/unit/precache-sw.test.ts
git commit -m "Precache every build's scripts, styles and fonts at install, and drop old builds"
```

---

### Task 6: Moving between screens offline

**Files:**
- Modify: `app/routes/app-layout.tsx`

On a client navigation, React Router re-runs the layout loader over the network. Offline, that fetch fails, and the app shows an error page even though Today needs nothing from the server.

- [ ] **Step 1: Add a `clientLoader`** below the `loader` in `app/routes/app-layout.tsx`:

```tsx
const LAYOUT_KEY = "rocky-layout";

/** Offline, who is signed in has not changed, so the last answer stands in. A redirect to sign in still goes through. */
export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  try {
    const data = await serverLoader();
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(data));
    } catch {
      // Private mode can refuse storage. The live answer is still good.
    }
    return data;
  } catch (err) {
    if (err instanceof Response) throw err;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LAYOUT_KEY);
    } catch {
      saved = null;
    }
    if (!saved) throw err;
    return JSON.parse(saved) as Awaited<ReturnType<typeof loader>>;
  }
}
```

The first load still uses the server's data embedded in the page (no `clientLoader.hydrate`), so nothing changes online.

- [ ] **Step 2: Typecheck.**

```bash
npm run typecheck
```

- [ ] **Step 3: Check it in dev.** Open Today, then Library, then use DevTools to fail requests to `*.data` (or turn the network off). Tap TODAY. Expected: Today shows from the store with no error page.

- [ ] **Step 4: Commit.**

```bash
git add app/routes/app-layout.tsx
git commit -m "Let the app move back to Today offline"
```

---

### Task 7: Look at it, then the full suite and the PR

- [ ] **Step 1: Sign in locally with a temporary password,** the same way F4a's Task 11 did, and put the hash back at the end.

- [ ] **Step 2: Compare Settings at 390 x 844** side by side with the `Settings` artboard. Check:
1. The header, signed-in box, voice pair, reminder rows, steps fields and sign out match the mock, without the AI parts.
2. Tap "Plain". It fills in ink at once, and Today's Rocky card reads "ROCKY".
3. Flip a reminder off. The time greys and the switch empties. Reload: it stays off.
4. Copy on the token puts `Bearer <token>` on the clipboard.
5. Run F3's contrast snippet on Settings and on Login (signed out). Expected: `all text passes`.

- [ ] **Step 3: Screenshots for the PR:** Settings (top and bottom), Login with the wrong-password error, and the "Open in another tab" screen. Save them in the session scratchpad.

- [ ] **Step 4: Put the local hash back,** then run the whole suite once:

```bash
npm run typecheck && npm test
```

Expected: all green. Fix only the failing files, then re-run those files only.

- [ ] **Step 5: Push and open the PR. Do not merge.**

```bash
git push -u origin v2/f4b-settings-login
gh pr create --title "Rocky v2 F4b: Settings, Login, one tab, offline shell" --body "<what changed, the calls at the top of this plan, the deviations, the screenshots>"
```

There are no migrations.

- [ ] **Step 6: Report back and wait.** After Kameron merges, confirm the Workers Builds check on the merge commit is green:

```bash
gh api repos/kameronpduhon/rocky-the-coach/commits/$(git rev-parse origin/main)/check-runs --jq '.check_runs[] | "\(.name) \(.status) \(.conclusion)"'
```

- [ ] **Step 7: Verify on the wire (Kameron's iPhone, installed app).** Kameron does these and reports:
1. Open the app once online, so the new worker installs. Close it fully.
2. Turn on airplane mode and reopen. Today shows from the phone's copy, with fonts.
3. Still offline, tap Settings and then Back. Today comes back with no error page. Settings itself needs a connection, so an error there is expected.
4. Online again: Settings shows "Signed in as Kameron" and names Catherine. Switching the voice changes Today's card label, and reminders save.
5. On a laptop, open kampduh.com in two tabs. The second says "Open in another tab," and "Use Rocky here" moves it.
6. Sign out, then sign in. The red button, and the inline error on a wrong password.
