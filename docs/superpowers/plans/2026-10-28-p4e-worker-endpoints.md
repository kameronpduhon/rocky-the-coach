# P4e: Worker Endpoints Implementation Plan

> **For agentic workers:** implement this plan task-by-task with the `executing-plans` skill. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every server need moves out of the React Router route modules and into Worker endpoints that run ahead of the app handler, while SSR stays on. After this step no route module exports a `loader`, `action` or `middleware`, so P4f can switch to SPA mode.

**Architecture:**
- **One API router in the Worker.** `workers/app.ts` calls `routeApi(request)` before React Router. `workers/api/router.ts` matches `/api/*` and `/media/*` to small handlers in `workers/api/*.ts`. A handler that needs a person runs inside `withUser`, which authenticates the session cookie and runs the handler under `runAsUser`, the same request scope the root middleware gives loaders today. Signed out is a 401 JSON response, never a redirect.
- **The phone asks the endpoints.** The app layout's `clientLoader` reads `GET /api/me` (offline it falls back to the copy in `localStorage`, as today). Login, sign out, Settings and the meal photo call their endpoints with `fetch`.
- **The week's plan is made by pull and the cron.** P4a already runs `ensureWeekPlan` in `/api/sync/pull` and the 5-minute cron. This plan moves pull into the Worker with that call kept, and deletes the layout loader's copy.
- **Existing API paths keep their paths and contracts,** so phones on the old build keep syncing through the deploy.

**Tech Stack:** Cloudflare Workers (D1, R2, Durable Objects), React Router 8.4 framework mode with SSR still on, the F2 sync layer, Vitest 4 (`unit` project in Node, `workers` project against real D1 through `@cloudflare/vitest-plugin`).

**Spec:** `docs/superpowers/specs/2026-10-28-checkin-plan-progress-library-design.md`, section 4 "SPA mode" ("Worker endpoints (P4e)" and "The app on the phone"), section 5 (the signed-out rows), section 6 rollout step 5, Testing ("P4e endpoints" and "On the wire"). Foundation: `docs/superpowers/specs/2026-10-27-foundation-design.md` ("Rendering": SPA mode comes in project 4). **Branch:** `v2/p4-checkin-plan-progress-library`, worktree `/Users/kameron/Code/rocky-wt/p4`. **Next:** `docs/superpowers/plans/2026-10-28-p4f-spa-mode.md`.

**There are no migrations in P4e.**

## Calls made in this plan (flag them when shipping)

- **`/api/me` is read once per page load, not on every tab tap.** The layout's `shouldRevalidate` returns false, because who is signed in only changes through a full page load (sign in, sign out). Today the layout loader runs on every navigation, so this removes a round trip from every tab tap. The plan-only redirect moves into the layout component, so it still runs on every navigation.
- **The `localStorage` copy of `/api/me` is saved by the loader,** not by a component effect. The old comment explained the effect existed because the first SSR load skipped the `clientLoader`; with no server loader, the `clientLoader` always runs.
- **Unknown `/api/*` and `/media/*` paths get a JSON 404** from the Worker (Task 9), so in P4f they never fall through to the SPA shell. A known path with the wrong method gets a 405, as the old resource routes did.
- **`authenticate` returns null when signed out** (Task 9). Its redirect and public-path list existed for the root middleware, which goes.
- **The root error boundary gains "Reload" now, not in P4f.** It costs nothing here and means the build phones run when P4f lands already has it. Its detail line moves from the v1 `text-label-2` to `text-ink-3`, the same colour (`--label-2` is `var(--ink-3)`), so P4f's cleanup can drop the alias.
- **New copy the spec doesn't give:**
    - Login with no signal: "Signing in needs a signal."
    - Login when the server answers with no message: "That didn't work. Try again."
    - Settings, "Turn on" notifications with no signal: "Notifications need a signal to turn on."
    - Settings, "Send a test" fails: "Could not send a test. Try again."
- **`GET /api/settings` keeps `ingestUrl`** as the spec's contract lists it, but Settings shows the address from `location.origin`, so it shows offline too. Only the token needs a signal ("Needs a signal to show your token.", from the spec).
- **Meal photo errors are 400 with `{ error }`,** an unknown meal is 404 with `{ error: "Not found" }`, and success is 200 `{ ok: true }`. The spec's contract gives only the bodies.

---

## Ground rules

- Everything from the earlier plans applies:
    - No em dashes in code, copy, commits or docs. No emojis.
    - No `Co-Authored-By` lines in commits.
    - Names in copy come from `APP_NAME` and `COACH_NAME` in `app/brand.ts`, never a literal "Rocky".
    - Look with `npm run dev`.
    - During tasks, run only the files named in the step. One full `npm run typecheck && npm test` at the end (Task 10).
    - One commit per task. Stage by path (`git add <paths>`, `git rm <paths>`), never `git add -A` or `git add .`: other agents write plan files in this worktree.
    - Never switch branches.
- `workers/api/*.ts` may import `~/server/*` and `cloudflare:workers`. Nothing under `app/routes`, `app/me.ts`, `app/settings`, `app/lib` or `app/meal` may (type-only imports are fine).
- Worker tests call the router the way a phone does: a real `Request` with a session cookie, through `api()` in `tests/workers/helpers.ts` (Task 1). User 1 is Kameron (`DB`, has a plan), user 2 is Catherine (`DB_CATHERINE`, no plan); the core migrations seed both.

## What P4a to P4d must have landed (Task 0 checks it)

- **No screen has a server loader or action** except the ones this plan moves: `settings.tsx` (loader, action), `meal.tsx` (photo action), `app-layout.tsx` (loader, middleware), `login.tsx` (action), `logout.tsx` (action), `media.tsx` (loader) and the six `api.*.ts` resource routes. Check-in, Plan, Groceries, Progress, Library, All lifts and the lift page read the phone's copy.
- **`ensureWeekPlan` runs in `/api/sync/pull` and in the 5-minute cron** (P4a, spec "Where the week's plan is made").
- **Rebuilt screens import nothing from `~/server/*` or `cloudflare:workers`,** except `import type`.
- **Nothing posts to a route action:** no `<Form method="post">`, `useFetcher().submit` or `fetcher.Form` aimed at a screen route. (v1's `WeighInSheet` posted to `/progress`; P4d replaces it.)

## Files

| File | Responsibility |
|---|---|
| `workers/api/router.ts` (new) | `routeApi`: matches `/api/*` and `/media/*` to a handler; 405 for a wrong method; 404 for an unknown API path (Task 9) |
| `workers/api/auth.ts` (new) | `withUser`: authenticate, run as that person, pass on an upgraded cookie, 401 when signed out |
| `workers/api/account.ts` (new) | `me`, `login`, `logout` |
| `workers/api/sync.ts` (new) | `pull` (with this week's plan) and `push` |
| `workers/api/vitals.ts`, `rest.ts`, `push.ts`, `ingest.ts` (new) | The moved resource routes, plus `POST /api/push/test` |
| `workers/api/settings.ts` (new) | `GET /api/settings`, `POST /api/backup` |
| `workers/api/media.ts` (new) | `GET /media/*`, `POST /api/meals/:slug/photo` |
| `workers/app.ts` | `routeApi` ahead of the React Router handler |
| `app/me.ts` (new) | `Me`, `loadMe`, `isPlanOnly`, `useMe` |
| `app/settings/load.ts` (new) | `loadSettings`: `GET /api/settings`, null offline |
| `app/lib/sign-in.ts` (new) | `signIn`: `POST /api/login`, the line to show |
| `app/routes/app-layout.tsx` | `clientLoader` on `/api/me`, `HydrateFallback`, `shouldRevalidate`, plan-only redirect in the component |
| `app/routes/today.tsx` | Reads the layout through `useMe` |
| `app/routes/settings.tsx` | `clientLoader` on `/api/settings`; test push, backup and sign out by `fetch` |
| `app/routes/login.tsx` | Posts with `fetch`, then a full load of `/` |
| `app/routes/meal.tsx`, `app/meal/PhotoBox.tsx` | The photo action goes; PhotoBox posts to the endpoint |
| `app/root.tsx` | Root middleware and server imports go; error boundary gains Reload |
| `app/routes.ts` | The resource routes, `media/*` and `logout` leave |
| `app/server/auth.server.ts` | `authenticate` returns null when signed out |
| `app/routes/api.*.ts`, `app/routes/media.tsx`, `app/routes/logout.tsx` | Deleted |
| `tests/workers/helpers.ts` | `cookieFor`, `api`, `KAMERON`, `CATHERINE` |
| `tests/workers/api-account.test.ts`, `api-sync.test.ts`, `api-device.test.ts`, `api-media.test.ts`, `api-settings.test.ts` (new) | The endpoints against real D1, R2 and the rest-timer Durable Object |
| `tests/unit/me.test.ts`, `tests/unit/settings/load.test.ts`, `tests/unit/sign-in.test.ts`, `tests/unit/route-modules.test.ts` (new) | The phone side, and the guard that no route module has server exports |
| `tests/workers/app-layout.test.ts`, `no-plan.test.ts`, `login.test.ts`, `meal-route.test.ts`, `settings-route.test.ts`, `vitals.test.ts`, `api-rest.test.ts`, `ingest.test.ts` | Deleted; each case is ported to an `api-*` test |
| `tests/workers/media.test.ts`, `auth.test.ts` | Route-loader cases move to `api-media`; `authenticate` cases follow its new contract |

---

### Task 0: Confirm P4a to P4d left only these server exports

No code. Stop and report if any check fails: that is P4a to P4d's work, not this plan's.

- [ ] **Step 1: Branch and tree.**

```bash
cd /Users/kameron/Code/rocky-wt/p4 && git branch --show-current && git status --short
```

Expected: `v2/p4-checkin-plan-progress-library`. Untracked plan files from other agents are fine; nothing modified under `app/`, `workers/` or `tests/`.

- [ ] **Step 2: The server exports left in route modules.**

```bash
rg -n '^export (async )?(function|const) (loader|action|middleware|headers)\b' app/routes app/root.tsx
```

Expected, and nothing else:
- `app/root.tsx`: `middleware`
- `app/routes/app-layout.tsx`: `middleware`, `loader`
- `app/routes/settings.tsx`: `loader`, `action`
- `app/routes/meal.tsx`: `action`
- `app/routes/login.tsx`, `app/routes/logout.tsx`: `action`
- `app/routes/media.tsx`: `loader`
- `app/routes/api.ingest.steps.ts`, `api.push.subscribe.ts`, `api.rest.ts`, `api.sync.push.ts`, `api.vitals.ts`: `loader`, `action`
- `app/routes/api.sync.pull.ts`: `loader`

- [ ] **Step 3: The week plan is made by pull and the cron.**

```bash
rg -n 'ensureWeekPlan' app/routes/api.sync.pull.ts app/jobs/scheduled.ts app/routes/app-layout.tsx
```

Expected: a call in each of the three files. The layout's goes in Task 6; the other two stay.

- [ ] **Step 4: Nothing posts to a screen's action, and who reads the layout's data.**

```bash
rg -n '<Form|fetcher\.Form|\.submit\(|action="/' app
rg -n 'layoutLoader|"routes/app-layout"' app
```

Expected from the first: only `app/routes/login.tsx` (its `Form`), `app/routes/settings.tsx` (two `fetcher.Form`s and the sign-out `Form` to `/logout`) and `app/meal/PhotoBox.tsx` (`fetcher.submit`). Note every hit of the second; Task 6 switches each to `useMe()`.

---

### Task 1: The API router, `withUser`, and `GET /api/me`

**Files:**
- Create: `workers/api/router.ts`, `workers/api/auth.ts`, `workers/api/account.ts`
- Modify: `workers/app.ts`, `tests/workers/helpers.ts`
- Test: `tests/workers/api-account.test.ts`

- [ ] **Step 1: Add the request helpers.** Append to `tests/workers/helpers.ts`, and add the two imports at the top:

```ts
import { commitSession, getSession } from "~/server/session.server";
import { routeApi } from "../../workers/api/router";
```

```ts
export const KAMERON = 1;
export const CATHERINE = 2;

/** A session cookie for a user id, as the browser sends it back. */
export async function cookieFor(userId: number): Promise<string> {
  const session = await getSession();
  session.set("userId", userId);
  return (await commitSession(session)).split(";")[0];
}

/** Calls the Worker's API router the way a phone does. `as` signs the request in as that user id. */
export async function api(path: string, init: RequestInit = {}, as?: number): Promise<Response> {
  const headers = new Headers(init.headers);
  if (as !== undefined) headers.set("Cookie", await cookieFor(as));
  const res = await routeApi(new Request(`http://localhost${path}`, { ...init, headers }));
  if (!res) throw new Error(`routeApi passed on ${path}`);
  return res;
}

export const postJson = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
```

- [ ] **Step 2: Write the failing tests.** Create `tests/workers/api-account.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { commitSession, getSession } from "~/server/session.server";
import { routeApi } from "../../workers/api/router";
import { api, CATHERINE, KAMERON } from "./helpers";

describe("GET /api/me", () => {
  it("is a 401 with JSON when signed out, never a redirect", async () => {
    const res = await api("/api/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Signed out" });
  });

  it("names each signed-in person and whether they have a plan", async () => {
    expect(await (await api("/api/me", {}, KAMERON)).json()).toEqual({ userId: 1, name: "Kameron", hasPlan: true });
    expect(await (await api("/api/me", {}, CATHERINE)).json()).toEqual({ userId: 2, name: "Catherine", hasPlan: false });
  });

  it("is never cached", async () => {
    expect((await api("/api/me", {}, KAMERON)).headers.get("Cache-Control")).toBe("no-store");
  });

  it("upgrades a v1 cookie to Kameron and sends the new cookie back", async () => {
    const v1 = await getSession();
    v1.set("signedIn", true);
    const cookie = (await commitSession(v1)).split(";")[0];
    const res = await api("/api/me", { headers: { Cookie: cookie } });
    expect(await res.json()).toMatchObject({ userId: 1 });
    const upgraded = await getSession(res.headers.get("Set-Cookie")!.split(";")[0]);
    expect(upgraded.get("userId")).toBe(1);
  });

  it("answers a wrong method with 405", async () => {
    expect((await api("/api/me", { method: "POST" }, KAMERON)).status).toBe(405);
  });
});

describe("routeApi", () => {
  it("passes on paths it doesn't own, so React Router still answers them", async () => {
    expect(await routeApi(new Request("http://localhost/plan"))).toBeNull();
    expect(await routeApi(new Request("http://localhost/"))).toBeNull();
  });
});
```

- [ ] **Step 3: Run them to make sure they fail.**

```bash
npx vitest run --project workers tests/workers/api-account.test.ts
```

Expected: FAIL, `Failed to load url ../../workers/api/router`.

- [ ] **Step 4: Write `withUser`.** Create `workers/api/auth.ts`:

```ts
import { authenticate } from "~/server/auth.server";
import { runAsUser } from "~/server/current-user.server";

/** Runs a handler as the signed-in person. Signed out gets a 401, never a redirect: every caller is fetch(). */
export async function withUser(request: Request, run: () => Promise<Response>): Promise<Response> {
  let auth: Awaited<ReturnType<typeof authenticate>>;
  try {
    auth = await authenticate(request);
  } catch (err) {
    // Until Task 9, authenticate throws a redirect or a 401 Response when signed out.
    if (!(err instanceof Response)) throw err;
    auth = null;
  }
  if (!auth) return Response.json({ error: "Signed out" }, { status: 401 });
  const response = await runAsUser(auth.user, run);
  if (auth.setCookie) response.headers.append("Set-Cookie", auth.setCookie);
  return response;
}
```

- [ ] **Step 5: Write `me`.** Create `workers/api/account.ts`:

```ts
import { currentUser } from "~/server/current-user.server";

const NO_STORE = { "Cache-Control": "no-store" };

/** Who is signed in. Replaces the app layout's loader. */
export async function me(): Promise<Response> {
  const user = currentUser();
  return Response.json({ userId: user.id, name: user.name, hasPlan: Boolean(user.planKey) }, { headers: NO_STORE });
}
```

- [ ] **Step 6: Write the router.** Create `workers/api/router.ts`:

```ts
import { me } from "./account";
import { withUser } from "./auth";

type Run = (request: Request, params: string[]) => Promise<Response>;
type ApiRoute = { method: string; path: RegExp; run: Run; open?: true };

const ROUTES: ApiRoute[] = [{ method: "GET", path: /^\/api\/me$/, run: me }];

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** Answers the Worker's own paths ahead of the app. Null means the path isn't an endpoint. */
export async function routeApi(request: Request): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  const onPath = ROUTES.filter((r) => r.path.test(pathname));
  if (!onPath.length) return null;
  const route = onPath.find((r) => r.method === request.method);
  if (!route) return new Response("Method not allowed", { status: 405, headers: { Allow: onPath.map((r) => r.method).join(", ") } });
  const params = route.path.exec(pathname)!.slice(1).map(decode);
  return route.open ? route.run(request, params) : withUser(request, () => route.run(request, params));
}
```

- [ ] **Step 7: Put the router ahead of React Router.** In `workers/app.ts`, add `import { routeApi } from "./api/router";` under the `httpsRedirect` import, and replace the `fetch` method with:

```ts
  async fetch(request) {
    return httpsRedirect(request) ?? (await routeApi(request)) ?? requestHandler(request);
  },
```

- [ ] **Step 8: Run the tests to make sure they pass.**

```bash
npx vitest run --project workers tests/workers/api-account.test.ts tests/workers/scheduled.test.ts
```

Expected: PASS. `scheduled.test.ts` imports `workers/app.ts`, so it proves the new import loads in the test runtime.

- [ ] **Step 9: Commit.**

```bash
git add workers/api/router.ts workers/api/auth.ts workers/api/account.ts workers/app.ts tests/workers/helpers.ts tests/workers/api-account.test.ts
git commit -m "The Worker answers /api/me ahead of the app, as the signed-in person"
```

---

### Task 2: `POST /api/login` and `POST /api/logout`

The login and logout route actions stay until Task 8 switches the screens; until then both work.

**Files:**
- Modify: `workers/api/account.ts`, `workers/api/router.ts`
- Test: `tests/workers/api-account.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/workers/api-account.test.ts`, add `import { env } from "cloudflare:test";` and add `postJson, setPassword` to the `./helpers` import. Append:

```ts
const signIn = (name: string, password: string, ip: string) =>
  api("/api/login", { ...postJson({ name, password }), headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip } });

describe("POST /api/login", () => {
  it("signs Catherine in to her own account with a 400-day cookie", async () => {
    await setPassword("catherine", "pw-catherine");
    const res = await signIn("Catherine", "pw-catherine", "198.51.100.1");
    expect(res.status).toBe(204);
    const cookie = res.headers.get("Set-Cookie")!;
    expect(cookie).toMatch(/Max-Age=34560000/);
    expect(await (await api("/api/me", { headers: { Cookie: cookie.split(";")[0] } })).json()).toMatchObject({ userId: 2 });
  });

  it("gives the same 401 for a wrong password and an unknown name", async () => {
    await setPassword("kameron", "pw-kameron");
    const wrong = await signIn("Kameron", "nope", "198.51.100.2");
    const unknown = await signIn("Nobody", "pw-kameron", "198.51.100.2");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: "That name and password don't match." });
    expect(await unknown.json()).toEqual({ error: "That name and password don't match." });
    expect(wrong.headers.get("Set-Cookie")).toBeNull();
  });

  it("locks an IP out after 5 failures, even with the right password", async () => {
    await setPassword("kameron", "pw-kameron");
    for (let i = 0; i < 5; i++) await signIn("kameron", "wrong", "192.0.2.50");
    const locked = await signIn("kameron", "pw-kameron", "192.0.2.50");
    expect(locked.status).toBe(429);
    expect(await locked.json()).toEqual({ error: "Too many tries. Wait 15 minutes." });
    expect(await env.CORE.prepare("select count(*) as n from login_attempts where ip = ?").bind("192.0.2.50").first()).toEqual({ n: 5 });
  });

  it("treats a body that isn't JSON as a failed try", async () => {
    const res = await api("/api/login", { method: "POST", body: "name=kameron", headers: { "CF-Connecting-IP": "198.51.100.3" } });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/logout", () => {
  it("clears the session cookie", async () => {
    const res = await api("/api/logout", { method: "POST" }, KAMERON);
    expect(res.status).toBe(204);
    const cleared = res.headers.get("Set-Cookie")!;
    expect(cleared).toMatch(/^__rocky=;/);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
  });

  it("works signed out too", async () => {
    expect((await api("/api/logout", { method: "POST" })).status).toBe(204);
  });
});
```

The 5 failures are 5 rows; the sixth try is refused before it is checked, so it records nothing.

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project workers tests/workers/api-account.test.ts
```

Expected: FAIL. `routeApi passed on /api/login`.

- [ ] **Step 3: Write `login` and `logout`.** In `workers/api/account.ts`, replace the imports with:

```ts
import { clientIp } from "~/server/auth.server";
import { currentUser } from "~/server/current-user.server";
import { verifyPassword } from "~/server/password";
import { commitSession, destroySession, getSession } from "~/server/session.server";
import { credentialsFor, isLockedOut, recordFailure } from "~/server/users.server";
```

and append:

```ts
/** JSON { name, password }. 204 with the session cookie, 401 for a wrong pair, 429 when this IP is locked out. */
export async function login(request: Request): Promise<Response> {
  const ip = clientIp(request);
  if (await isLockedOut(ip)) return Response.json({ error: "Too many tries. Wait 15 minutes." }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { name?: unknown; password?: unknown } | null;
  const found = await credentialsFor(String(body?.name ?? ""));
  const ok = await verifyPassword(String(body?.password ?? ""), found?.passwordHash ?? null);
  if (!found || !ok) {
    await recordFailure(ip);
    return Response.json({ error: "That name and password don't match." }, { status: 401 });
  }
  const session = await getSession(request.headers.get("Cookie"));
  session.unset("signedIn");
  session.set("userId", found.user.id);
  return new Response(null, { status: 204, headers: { "Set-Cookie": await commitSession(session) } });
}

export async function logout(request: Request): Promise<Response> {
  const session = await getSession(request.headers.get("Cookie"));
  return new Response(null, { status: 204, headers: { "Set-Cookie": await destroySession(session) } });
}
```

- [ ] **Step 4: Route them.** In `workers/api/router.ts`, import `login, logout` from `./account` beside `me`, and replace `ROUTES` with:

```ts
const ROUTES: ApiRoute[] = [
  { method: "GET", path: /^\/api\/me$/, run: me },
  { method: "POST", path: /^\/api\/login$/, run: login, open: true },
  { method: "POST", path: /^\/api\/logout$/, run: logout, open: true },
];
```

- [ ] **Step 5: Run the tests to make sure they pass.**

```bash
npx vitest run --project workers tests/workers/api-account.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add workers/api/account.ts workers/api/router.ts tests/workers/api-account.test.ts
git commit -m "Sign in and sign out have Worker endpoints"
```

---

### Task 3: Sync pull and push move into the Worker, with this week's plan

Phones already call `/api/sync/pull` and `/api/sync/push`. The Worker now answers them first, so the React Router resource routes are dead and go in the same commit.

**Files:**
- Create: `workers/api/sync.ts`
- Modify: `workers/api/router.ts`, `app/routes.ts`
- Delete: `app/routes/api.sync.pull.ts`, `app/routes/api.sync.push.ts`
- Test: `tests/workers/api-sync.test.ts`

- [ ] **Step 1: Read the pull loader as P4a left it.**

```bash
cat app/routes/api.sync.pull.ts app/routes/api.sync.push.ts
```

The handler in Step 4 is that loader's body. If P4a wrapped the week-plan call in a helper (for example `ensureThisWeek`), call that helper in place of the `if (currentUser().planKey) ...` line in Step 4, and keep everything else.

- [ ] **Step 2: Write the failing tests.** Create `tests/workers/api-sync.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getDb } from "~/db/client";
import { addDays, mealDate, weekStart } from "~/domain/dates";
import { logWeighIn } from "~/server/body.server";
import { api, CATHERINE, KAMERON, postJson } from "./helpers";

const plannedThisWeek = async (d1: D1Database) => {
  const monday = weekStart(mealDate());
  return (await d1.prepare("SELECT count(*) AS n FROM planned_meals WHERE date BETWEEN ? AND ?").bind(monday, addDays(monday, 6)).first<{ n: number }>())!.n;
};
const pull = (as?: number, clientId = "phone-test-1") => api(`/api/sync/pull?since=0&clientId=${clientId}`, {}, as);

describe("GET /api/sync/pull", () => {
  it("is a 401 when signed out", async () => {
    expect((await pull()).status).toBe(401);
  });

  it("makes this week's plan for a person with one before reading, so it syncs down", async () => {
    const res = await pull(KAMERON);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    // Seven days of five slots.
    expect(await plannedThisWeek(env.DB)).toBe(35);
    const body = (await res.json()) as { snapshot: boolean; puts: { planned_meals: { date: string }[] } };
    expect(body.snapshot).toBe(true);
    const monday = weekStart(mealDate());
    expect(body.puts.planned_meals.filter((r) => r.date >= monday && r.date <= addDays(monday, 6))).toHaveLength(35);
  });

  it("plans nothing for Catherine, who has no plan", async () => {
    expect((await pull(CATHERINE)).status).toBe(200);
    expect(await plannedThisWeek(env.DB_CATHERINE)).toBe(0);
  });

  it("reads only the signed-in person's database", async () => {
    await logWeighIn(getDb(env.DB_CATHERINE), "2026-10-26", 139.8, new Date());
    const hers = (await (await pull(CATHERINE)).json()) as { puts: { weigh_ins: { date: string }[] } };
    const his = (await (await pull(KAMERON)).json()) as { puts: { weigh_ins: { date: string }[] } };
    expect(hers.puts.weigh_ins.map((r) => r.date)).toContain("2026-10-26");
    expect(his.puts.weigh_ins.map((r) => r.date)).not.toContain("2026-10-26");
  });

  it("refuses a bad pull", async () => {
    expect((await api("/api/sync/pull?since=-1&clientId=phone-test-1", {}, KAMERON)).status).toBe(400);
    expect((await api("/api/sync/pull?since=0&clientId=short", {}, KAMERON)).status).toBe(400);
  });
});

describe("POST /api/sync/push", () => {
  it("applies a change to the signed-in person's database only", async () => {
    const res = await api("/api/sync/push", postJson({ clientId: "phone-cat-1", mutations: [{ id: 1, name: "setVoice", args: { voice: "plain" } }] }), CATHERINE);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lastMutationId: 1, rejected: [] });
    expect(((await (await pull(CATHERINE, "phone-cat-1")).json()) as { lastMutationId: number }).lastMutationId).toBe(1);
    expect(((await (await pull(KAMERON, "phone-cat-1")).json()) as { lastMutationId: number }).lastMutationId).toBe(0);
  });

  it("refuses a bad body and a GET", async () => {
    expect((await api("/api/sync/push", postJson({ nope: true }), KAMERON)).status).toBe(400);
    expect((await api("/api/sync/push", {}, KAMERON)).status).toBe(405);
  });

  it("is a 401 when signed out", async () => {
    expect((await api("/api/sync/push", postJson({ clientId: "phone-x-12", mutations: [] }))).status).toBe(401);
  });
});
```

- [ ] **Step 3: Run them to make sure they fail.**

```bash
npx vitest run --project workers tests/workers/api-sync.test.ts
```

Expected: FAIL. `routeApi passed on /api/sync/pull?since=0&clientId=phone-test-1`.

- [ ] **Step 4: Write the handlers.** Create `workers/api/sync.ts`:

```ts
import { mealDate, weekStart } from "~/domain/dates";
import { serverNow } from "~/server/clock.server";
import { currentUser, userD1, userDb } from "~/server/current-user.server";
import { ensureWeekPlan } from "~/server/meal-plan.server";
import { processPull } from "~/sync/pull.server";
import { PushBody, processPush } from "~/sync/push.server";

export async function pull(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const since = Number(url.searchParams.get("since") ?? "0");
  const clientId = url.searchParams.get("clientId") ?? "";
  if (!Number.isInteger(since) || since < 0 || clientId.length < 8) return Response.json({ error: "Bad pull" }, { status: 400 });
  // Today reads this week's meals from the phone's copy, so they must exist before the pull reads them.
  if (currentUser().planKey) await ensureWeekPlan(userDb(), weekStart(mealDate(serverNow())));
  return Response.json(await processPull(userD1(), since, clientId), { headers: { "Cache-Control": "no-store" } });
}

export async function push(request: Request): Promise<Response> {
  const parsed = PushBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad push" }, { status: 400 });
  return Response.json(await processPush(userD1(), parsed.data, serverNow()));
}
```

- [ ] **Step 5: Route them, and delete the resource routes.** In `workers/api/router.ts`, add `import { pull, push } from "./sync";` and append to `ROUTES`:

```ts
  { method: "GET", path: /^\/api\/sync\/pull$/, run: pull },
  { method: "POST", path: /^\/api\/sync\/push$/, run: push },
```

In `app/routes.ts`, delete these two lines:

```ts
  route("api/sync/push", "routes/api.sync.push.ts"),
  route("api/sync/pull", "routes/api.sync.pull.ts"),
```

```bash
git rm app/routes/api.sync.pull.ts app/routes/api.sync.push.ts
rg -ln '~/routes/api\.sync' tests
```

For each test file the `rg` lists (P4a's pull test, if it called the loader), delete the cases that call the route; `api-sync.test.ts` covers them. Delete the file if nothing is left in it.

- [ ] **Step 6: Run the tests to make sure they pass.**

```bash
npx vitest run --project workers tests/workers/api-sync.test.ts tests/workers/sync-pull.test.ts tests/workers/sync-push.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit.** Add any test file Step 5 changed or deleted to the paths.

```bash
git add workers/api/sync.ts workers/api/router.ts app/routes.ts tests/workers/api-sync.test.ts
git commit -m "Sync pull and push are Worker endpoints; pull still makes this week's plan"
```

---

### Task 4: Vitals, push subscribe, the rest timer and steps ingest

Same move for the other four resource routes. Each keeps its path, methods and responses.

**Files:**
- Create: `workers/api/vitals.ts`, `workers/api/rest.ts`, `workers/api/push.ts`, `workers/api/ingest.ts`
- Modify: `workers/api/router.ts`, `app/routes.ts`
- Delete: `app/routes/api.vitals.ts`, `app/routes/api.rest.ts`, `app/routes/api.push.subscribe.ts`, `app/routes/api.ingest.steps.ts`, `tests/workers/vitals.test.ts`, `tests/workers/api-rest.test.ts`, `tests/workers/ingest.test.ts`
- Test: `tests/workers/api-device.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/workers/api-device.test.ts`. The ingest and rest cases are the deleted files' cases, called through the router; the isolation cases are new.

```ts
import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { localDate } from "~/domain/dates";
import { stepsFor } from "~/server/body.server";
import { api, CATHERINE, db, KAMERON, postJson, setIngestToken } from "./helpers";

describe("POST /api/vitals", () => {
  it("stores a tap latency in the signed-in person's database", async () => {
    const res = await api("/api/vitals", postJson({ route: "/", inp: 72, target: "button.btn-prominent" }), KAMERON);
    expect(res.status).toBe(204);
    expect(await env.DB.prepare("select route, inp_ms, target from vitals").first()).toEqual({ route: "/", inp_ms: 72, target: "button.btn-prominent" });
  });

  it("writes Catherine's to hers", async () => {
    await api("/api/vitals", postJson({ route: "/library", inp: 40 }), CATHERINE);
    expect(await env.DB_CATHERINE.prepare("select count(*) as n from vitals where inp_ms = 40").first()).toEqual({ n: 1 });
    expect(await env.DB.prepare("select count(*) as n from vitals where inp_ms = 40").first()).toEqual({ n: 0 });
  });

  it("ignores junk and is a 401 signed out", async () => {
    expect((await api("/api/vitals", postJson({ route: "/", inp: -1 }), KAMERON)).status).toBe(400);
    expect((await api("/api/vitals", postJson("nope"), KAMERON)).status).toBe(400);
    expect((await api("/api/vitals", postJson({ route: "/", inp: 72 }))).status).toBe(401);
  });
});

describe("POST /api/push/subscribe", () => {
  const sub = { endpoint: "https://web.push.apple.com/cat-1", keys: { p256dh: "p256dh-key", auth: "auth-key" } };

  it("saves the device to the signed-in person's database", async () => {
    expect(await (await api("/api/push/subscribe", postJson(sub), CATHERINE)).json()).toEqual({ ok: true });
    expect(await env.DB_CATHERINE.prepare("select endpoint from push_subscriptions").first()).toEqual({ endpoint: "https://web.push.apple.com/cat-1" });
    expect(await env.DB.prepare("select count(*) as n from push_subscriptions").first()).toEqual({ n: 0 });
  });

  it("refuses a subscription that isn't https", async () => {
    expect((await api("/api/push/subscribe", postJson({ ...sub, endpoint: "http://x" }), KAMERON)).status).toBe(400);
  });
});

describe("/api/rest", () => {
  const timer = (binding: string) => env.REST_TIMER.get(env.REST_TIMER.idFromName(binding));
  const alarm = (binding: string) => runInDurableObject(timer(binding), (_o, state) => state.storage.getAlarm());

  it("schedules the signed-in person's ping, and DELETE cancels it", async () => {
    const res = await api("/api/rest", postJson({ seconds: 150, title: "Rest's up", body: "Set 2 of leg press" }), KAMERON);
    expect(res.status).toBe(204);
    expect(await alarm("DB")).not.toBeNull();
    expect((await api("/api/rest", { method: "DELETE" }, KAMERON)).status).toBe(204);
    expect(await alarm("DB")).toBeNull();
  });

  it("uses Catherine's own timer", async () => {
    await api("/api/rest", postJson({ seconds: 90, title: "Rest's up", body: "" }), CATHERINE);
    expect(await alarm("DB_CATHERINE")).not.toBeNull();
    expect(await alarm("DB")).toBeNull();
  });

  it("refuses a bad body", async () => {
    expect((await api("/api/rest", postJson({ seconds: 0, title: "", body: "" }), KAMERON)).status).toBe(400);
    expect((await api("/api/rest", postJson({ seconds: 5000, title: "x", body: "" }), KAMERON)).status).toBe(400);
  });
});

describe("POST /api/ingest/steps", () => {
  const send = (body: unknown, token = "test-ingest-token") =>
    api("/api/ingest/steps", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("needs no session, only its token", async () => {
    expect((await send({ date: localDate(), steps: 100 }, "nope")).status).toBe(401);
    expect((await send({ date: localDate(), steps: 4321 })).status).toBe(200);
    expect(await stepsFor(db(), localDate())).toBe(4321);
  });

  it("accepts steps sent as a string with decimals", async () => {
    await send({ date: localDate(), steps: "5,012.0" });
    expect(await stepsFor(db(), localDate())).toBe(5012);
  });

  it("rejects dates far from today and silly counts", async () => {
    expect((await send({ date: "2020-01-01", steps: 10 })).status).toBe(400);
    expect((await send({ date: localDate(), steps: 500000 })).status).toBe(400);
    expect((await send({ date: localDate(), steps: "" })).status).toBe(400);
  });

  it("writes Catherine's steps to her own database", async () => {
    await setIngestToken("catherine", "cat-token");
    expect((await send({ date: localDate(), steps: 6100 }, "cat-token")).status).toBe(200);
    expect(await env.DB_CATHERINE.prepare("select steps from steps_daily where date = ?").bind(localDate()).first()).toEqual({ steps: 6100 });
    expect(await env.DB.prepare("select count(*) as n from steps_daily where steps = 6100").first()).toEqual({ n: 0 });
  });

  it("answers a GET with 405, as before", async () => {
    expect((await api("/api/ingest/steps")).status).toBe(405);
  });
});
```

Before running, open `tests/workers/ingest.test.ts` and port any case it has beyond these five into the last `describe`, the same way.

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project workers tests/workers/api-device.test.ts
```

Expected: FAIL, `routeApi passed on /api/vitals`.

- [ ] **Step 3: Write the four handler files.** Each is its old route's action, with the route types and the 405 loader dropped (the router answers wrong methods).

`workers/api/vitals.ts`:

```ts
import { z } from "zod";
import { userD1 } from "~/server/current-user.server";

const Beacon = z.object({ route: z.string().max(200), inp: z.number().int().min(0).max(60_000), target: z.string().max(200).optional() });

export async function vitals(request: Request): Promise<Response> {
  const parsed = Beacon.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const { route, inp, target } = parsed.data;
  await userD1().prepare("INSERT INTO vitals (route, inp_ms, target, at) VALUES (?, ?, ?, ?)").bind(route, inp, target ?? null, new Date().toISOString()).run();
  return new Response(null, { status: 204 });
}
```

`workers/api/rest.ts`:

```ts
import { env } from "cloudflare:workers";
import { z } from "zod";
import { currentUser } from "~/server/current-user.server";

const Ping = z.object({ seconds: z.number().int().min(1).max(600), title: z.string().min(1).max(80), body: z.string().max(160) });

function timer() {
  return env.REST_TIMER.get(env.REST_TIMER.idFromName(currentUser().dbBinding));
}

/** Schedules the rest ping, replacing any earlier one. */
export async function scheduleRest(request: Request): Promise<Response> {
  const parsed = Ping.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const { seconds, title, body } = parsed.data;
  await timer().schedule({ binding: currentUser().dbBinding, title, body }, seconds);
  return new Response(null, { status: 204 });
}

export async function cancelRest(): Promise<Response> {
  await timer().cancel();
  return new Response(null, { status: 204 });
}
```

`workers/api/push.ts`:

```ts
import { userDb } from "~/server/current-user.server";
import { saveSubscription } from "~/server/push.server";

export async function subscribe(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
  if (!body?.endpoint?.startsWith("https://") || !body.keys?.p256dh || !body.keys.auth) {
    return Response.json({ error: "Bad subscription" }, { status: 400 });
  }
  await saveSubscription(userDb(), { endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } });
  return Response.json({ ok: true });
}
```

`workers/api/ingest.ts`: copy `app/routes/api.ingest.steps.ts` as it stands, then make three changes. Delete `import type { Route } from "./+types/api.ingest.steps";`. Delete the `loader` function. Replace the `action` signature line with:

```ts
/** Public: the iPhone Shortcut sends a bearer token, not a session. */
export async function ingestSteps(request: Request): Promise<Response> {
```

- [ ] **Step 4: Route them, and delete the old routes and tests.** In `workers/api/router.ts`, add:

```ts
import { ingestSteps } from "./ingest";
import { subscribe } from "./push";
import { cancelRest, scheduleRest } from "./rest";
import { vitals } from "./vitals";
```

and append to `ROUTES`:

```ts
  { method: "POST", path: /^\/api\/vitals$/, run: vitals },
  { method: "POST", path: /^\/api\/push\/subscribe$/, run: subscribe },
  { method: "POST", path: /^\/api\/rest$/, run: scheduleRest },
  { method: "DELETE", path: /^\/api\/rest$/, run: cancelRest },
  { method: "POST", path: /^\/api\/ingest\/steps$/, run: ingestSteps, open: true },
```

In `app/routes.ts`, delete these four lines:

```ts
  route("api/push/subscribe", "routes/api.push.subscribe.ts"),
  route("api/ingest/steps", "routes/api.ingest.steps.ts"),
  route("api/vitals", "routes/api.vitals.ts"),
  route("api/rest", "routes/api.rest.ts"),
```

```bash
git rm app/routes/api.vitals.ts app/routes/api.rest.ts app/routes/api.push.subscribe.ts app/routes/api.ingest.steps.ts
git rm tests/workers/vitals.test.ts tests/workers/api-rest.test.ts tests/workers/ingest.test.ts
```

- [ ] **Step 5: Run the tests to make sure they pass.**

```bash
npx vitest run --project workers tests/workers/api-device.test.ts tests/workers/rest-timer.test.ts tests/workers/push.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add workers/api/vitals.ts workers/api/rest.ts workers/api/push.ts workers/api/ingest.ts workers/api/router.ts app/routes.ts tests/workers/api-device.test.ts
git commit -m "Vitals, push subscribe, the rest timer and steps ingest are Worker endpoints"
```

---

### Task 5: Media and the meal photo

**Files:**
- Create: `workers/api/media.ts`
- Modify: `workers/api/router.ts`, `app/routes.ts`, `app/routes/meal.tsx`, `app/meal/PhotoBox.tsx`, `tests/workers/media.test.ts`
- Delete: `app/routes/media.tsx`, `tests/workers/meal-route.test.ts`
- Test: `tests/workers/api-media.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/workers/api-media.test.ts`:

```ts
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "~/db/client";
import { mealState } from "~/db/schema";
import { api, CATHERINE, db, KAMERON } from "./helpers";

const upload = (slug: string, photo: Blob | string | null, as?: number) => {
  const body = new FormData();
  if (photo !== null) body.set("photo", photo);
  return api(`/api/meals/${slug}/photo`, { method: "POST", body }, as);
};
const jpeg = () => new File([new Uint8Array([9, 9])], "photo.jpg", { type: "image/jpeg" });

describe("GET /media/*", () => {
  it("serves an R2 object with its content type and a long private cache", async () => {
    await env.MEDIA.put("exercises/Butterfly/0.jpg", new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: "image/jpeg" } });
    const res = await api("/media/exercises/Butterfly/0.jpg", {}, KAMERON);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    expect(res.headers.get("ETag")).toBeTruthy();
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("decodes the key", async () => {
    await env.MEDIA.put("exercises/Seated Row/0.jpg", new Uint8Array([4]));
    expect((await api("/media/exercises/Seated%20Row/0.jpg", {}, KAMERON)).status).toBe(200);
  });

  it("404s a missing key and 401s signed out", async () => {
    expect((await api("/media/nope.jpg", {}, KAMERON)).status).toBe(404);
    expect((await api("/media/exercises/Butterfly/0.jpg")).status).toBe(401);
  });
});

describe("POST /api/meals/:slug/photo", () => {
  it("stores the photo in R2 and on the signed-in person's meal", async () => {
    const res = await upload("steak-and-eggs", jpeg(), KAMERON);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const row = await db().select().from(mealState).where(eq(mealState.slug, "steak-and-eggs")).get();
    expect(await env.MEDIA.get(row!.photoKey!)).not.toBeNull();
    expect((await api(`/media/${row!.photoKey}`, {}, KAMERON)).status).toBe(200);
  });

  it("writes Catherine's photo to her meal_state, not Kameron's", async () => {
    await upload("salmon-and-rice", jpeg(), CATHERINE);
    expect(await getDb(env.DB_CATHERINE).select().from(mealState).where(eq(mealState.slug, "salmon-and-rice")).get()).toBeTruthy();
    expect(await db().select().from(mealState).where(eq(mealState.slug, "salmon-and-rice")).get()).toBeUndefined();
  });

  it("says what is wrong", async () => {
    expect(await (await upload("steak-and-eggs", null, KAMERON)).json()).toEqual({ error: "Choose a photo." });
    const txt = await upload("steak-and-eggs", new File(["hi"], "a.txt", { type: "text/plain" }), KAMERON);
    expect(txt.status).toBe(400);
    expect(await txt.json()).toEqual({ error: "Upload an image" });
  });

  it("404s an unknown meal and 401s signed out", async () => {
    const res = await upload("nope", jpeg(), KAMERON);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
    expect((await upload("steak-and-eggs", jpeg())).status).toBe(401);
  });
});
```

Then trim `tests/workers/media.test.ts` to the two `saveMealPhoto` cases ("stores a meal photo and replaces the old one", "rejects non-images"): delete the two `loader` cases, and the `import { loader } from "~/routes/media";` and `routeArgs` imports.

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project workers tests/workers/api-media.test.ts
```

Expected: FAIL, `routeApi passed on /media/exercises/Butterfly/0.jpg`.

- [ ] **Step 3: Write the handlers.** Create `workers/api/media.ts`:

```ts
import { env } from "cloudflare:workers";
import { meals } from "~/content";
import { userDb } from "~/server/current-user.server";
import { saveMealPhoto } from "~/server/photos.server";

export async function media(_request: Request, [key]: string[]): Promise<Response> {
  const obj = key ? await env.MEDIA.get(key) : null;
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: obj.httpEtag,
    },
  });
}

/** Multipart `photo`. The new photo_key reaches the phone with its next pull. */
export async function mealPhoto(request: Request, [slug]: string[]): Promise<Response> {
  if (!meals.has(slug)) return Response.json({ error: "Not found" }, { status: 404 });
  const photo = (await request.formData().catch(() => null))?.get("photo");
  if (!(photo instanceof File)) return Response.json({ error: "Choose a photo." }, { status: 400 });
  try {
    await saveMealPhoto(userDb(), slug, photo);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "That photo didn't save." }, { status: 400 });
  }
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Route them, and delete the media route.** In `workers/api/router.ts`, add `import { mealPhoto, media } from "./media";` and append to `ROUTES`:

```ts
  { method: "GET", path: /^\/media\/(.+)$/, run: media },
  { method: "POST", path: /^\/api\/meals\/([^/]+)\/photo$/, run: mealPhoto },
```

In `app/routes.ts`, delete `  route("media/*", "routes/media.tsx"),`.

```bash
git rm app/routes/media.tsx tests/workers/meal-route.test.ts
```

- [ ] **Step 5: The meal route loses its action.** In `app/routes/meal.tsx`, delete the whole `action` function with its doc comment, and these imports:

```ts
import { userDb } from "~/server/current-user.server";
import { saveMealPhoto } from "~/server/photos.server";
```

- [ ] **Step 6: PhotoBox posts to the endpoint.** In `app/meal/PhotoBox.tsx`, replace the imports and the top of `PhotoBox` (from `export function PhotoBox` down to the closing `}` of `onChange`) with:

```tsx
import { useState } from "react";
import { Icon } from "~/components/ui";
import { useSyncClient, useSyncStatus } from "~/sync/react";
```

```tsx
/** The meal's photo, or a place to add one. The photo goes to R2, so this is the meal screen's one server request. */
export function PhotoBox({ slug, photoKey, alt }: { slug: string; photoKey: string | null; alt: string }) {
  const client = useSyncClient();
  const offline = useSyncStatus()?.online === false;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("photo", await shrink(file));
      const res = await fetch(`/api/meals/${encodeURIComponent(slug)}/photo`, { method: "POST", body });
      const reply = (await res.json().catch(() => ({}))) as { ok?: true; error?: string };
      // The new photo_key comes down with the next pull, like any other change.
      if (reply.ok) void client?.sync();
      else setError(reply.error ?? "That photo didn't save.");
    } catch {
      setError("Photos need a signal");
    } finally {
      setBusy(false);
    }
  }
```

Keep `shrink` above it as it is. In the JSX below, replace `{fetcher.data?.error && <p className="text-[14px] text-ink-2">{fetcher.data.error}</p>}` with:

```tsx
      {error && <p className="text-[14px] text-ink-2">{error}</p>}
```

`busy` keeps its meaning, so the `input`, `label` and the rest of the JSX don't change.

- [ ] **Step 7: Run the tests and the typecheck.**

```bash
npx vitest run --project workers tests/workers/api-media.test.ts tests/workers/media.test.ts
npm run typecheck
```

Expected: PASS, and no type errors.

- [ ] **Step 8: Look.** `npm run dev`, sign in, open a meal from Today and add a photo. The photo shows after the upload and stays after a reload. In devtools, the request is `POST /api/meals/<slug>/photo` and answers `{"ok":true}`.

- [ ] **Step 9: Commit.**

```bash
git add workers/api/media.ts workers/api/router.ts app/routes.ts app/routes/meal.tsx app/meal/PhotoBox.tsx tests/workers/api-media.test.ts tests/workers/media.test.ts
git commit -m "Media and the meal photo upload are Worker endpoints"
```

---

### Task 6: The layout reads `/api/me`

The layout loader, its plan-only middleware and its `ensureWeekPlan` call go. Pull and the cron make the week's plan (Task 0, Step 3).

**Files:**
- Create: `app/me.ts`
- Modify: `app/routes/app-layout.tsx`, `app/routes/today.tsx`, and every other file Task 0 Step 4 listed for `layoutLoader`
- Delete: `tests/workers/app-layout.test.ts`, `tests/workers/no-plan.test.ts`
- Test: `tests/unit/me.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/me.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isPlanOnly, loadMe, type Me } from "~/me";

const KAMERON: Me = { userId: 1, name: "Kameron", hasPlan: true };

function memory(seed?: Me) {
  const store = new Map<string, string>(seed ? [["rocky-layout", JSON.stringify(seed)]] : []);
  return { store, storage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } };
}
const answer = (res: Response) => (async () => res) as unknown as typeof fetch;
const noSignal = (async () => {
  throw new TypeError("Load failed");
}) as unknown as typeof fetch;

describe("loadMe", () => {
  it("returns the server's answer and saves it for offline", async () => {
    const { store, storage } = memory();
    expect(await loadMe(answer(Response.json(KAMERON)), storage)).toEqual(KAMERON);
    expect(JSON.parse(store.get("rocky-layout")!)).toEqual(KAMERON);
  });

  it("sends a signed-out person to sign in, even with a saved copy", async () => {
    const thrown = await loadMe(answer(new Response(null, { status: 401 })), memory(KAMERON).storage).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(302);
    expect((thrown as Response).headers.get("Location")).toBe("/login");
  });

  it("uses the saved copy with no signal or a server error", async () => {
    expect(await loadMe(noSignal, memory(KAMERON).storage)).toEqual(KAMERON);
    expect(await loadMe(answer(new Response(null, { status: 503 })), memory(KAMERON).storage)).toEqual(KAMERON);
  });

  it("fails with no signal and nothing saved", async () => {
    await expect(loadMe(noSignal, memory().storage)).rejects.toThrow("hasn't signed in");
  });

  it("still answers when storage is blocked", async () => {
    expect(await loadMe(answer(Response.json(KAMERON)), null)).toEqual(KAMERON);
  });
});

describe("isPlanOnly", () => {
  it("covers the screens that need a plan", () => {
    for (const path of ["/plan", "/progress", "/progress/lifts", "/workout", "/meal/chicken-and-rice-bowl", "/check-in", "/groceries"]) expect(isPlanOnly(path), path).toBe(true);
  });

  it("leaves Today, Library, the lift page and Settings open", () => {
    for (const path of ["/", "/library", "/lift/12", "/settings", "/planner"]) expect(isPlanOnly(path), path).toBe(false);
  });
});
```

If P4c or P4d added a plan-only screen whose path doesn't start with one of these six words, add it to the first list, and to `PLAN_ONLY` in Step 3.

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/me.test.ts
```

Expected: FAIL, `Failed to load url ~/me`.

- [ ] **Step 3: Write `app/me.ts`.**

```ts
import { redirect, useRouteLoaderData } from "react-router";

/** The signed-in person, from GET /api/me. */
export type Me = { userId: number; name: string; hasPlan: boolean };

const SAVED = "rocky-layout";

// Screens that only make sense with a plan. Library, the lift page and Settings work for everyone.
const PLAN_ONLY = /^\/(plan|progress|workout|meal|check-in|groceries)(\/|$)/;

export const isPlanOnly = (pathname: string) => PLAN_ONLY.test(pathname);

type KeyValue = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): KeyValue | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/** Offline, who is signed in has not changed, so the last answer stands in. A 401 still goes to sign in. */
export async function loadMe(send: typeof fetch = fetch, storage: KeyValue | null = browserStorage()): Promise<Me> {
  let res: Response | null;
  try {
    res = await send("/api/me");
  } catch {
    res = null;
  }
  if (res?.status === 401) throw redirect("/login");
  if (res?.ok) {
    const me = (await res.json()) as Me;
    try {
      storage?.setItem(SAVED, JSON.stringify(me));
    } catch {
      // Private mode can refuse storage. The live answer is still good.
    }
    return me;
  }
  let saved: string | null = null;
  try {
    saved = storage?.getItem(SAVED) ?? null;
  } catch {
    saved = null;
  }
  if (saved) return JSON.parse(saved) as Me;
  throw new Error("Can't reach the server, and this phone hasn't signed in before.");
}

/** The signed-in person, as the app layout loaded them. Undefined outside the layout. */
export function useMe(): Me | undefined {
  return useRouteLoaderData("routes/app-layout") as Me | undefined;
}
```

- [ ] **Step 4: Run the tests to make sure they pass.**

```bash
npx vitest run --project unit tests/unit/me.test.ts
```

Expected: PASS.

- [ ] **Step 5: Rewrite the layout's top half.** In `app/routes/app-layout.tsx`, replace everything above `export default function AppLayout` with:

```tsx
import { useEffect } from "react";
import { Navigate, Outlet, useLocation, useMatches, useNavigation } from "react-router";
import type { Route } from "./+types/app-layout";
import { PendingSync } from "~/components/PendingSync";
import { SyncNotice } from "~/components/SyncNotice";
import { TabBar } from "~/components/TabBar";
import { isPlanOnly, loadMe } from "~/me";
import { SyncProvider } from "~/sync/react";

// onINP can't be unregistered, so a second effect run (StrictMode in dev) would report every tap twice.
let reportingInp = false;

export async function clientLoader() {
  return loadMe();
}

// Who is signed in only changes with a full page load (sign in, sign out), so tab taps don't wait on the network.
export function shouldRevalidate() {
  return false;
}

export function HydrateFallback() {
  return <main aria-busy="true" className="min-h-dvh" />;
}
```

In `AppLayout`:
- Add `const { pathname } = useLocation();` as its first line.
- Delete the `useEffect` that writes `LAYOUT_KEY` to `localStorage`, with its comment. `loadMe` saves now.
- Directly above `return (`, after the INP `useEffect`, add:

```tsx
  // The redirect runs here, not in the loader, because the loader runs once per page load.
  if (!loaderData.hasPlan && isPlanOnly(pathname)) return <Navigate to="/" replace />;
```

Leave the JSX as it is. Check: `rg -n 'LAYOUT_KEY|serverLoader|ensureWeekPlan|\.server' app/routes/app-layout.tsx` prints nothing.

- [ ] **Step 6: Screens read the layout through `useMe`.** In `app/routes/today.tsx`:
- Delete `import type { loader as layoutLoader } from "./app-layout";`.
- Add `import { useMe } from "~/me";`.
- Replace `const layout = useRouteLoaderData<typeof layoutLoader>("routes/app-layout");` with `const layout = useMe();`.
- Remove `useRouteLoaderData` from the `react-router` import.

Do the same in every other file Task 0 Step 4 listed. Then:

```bash
rg -n 'layoutLoader|"routes/app-layout"' app
```

Expected: only `app/me.ts`.

- [ ] **Step 7: Delete the layout's worker tests.** `/api/me` (Task 1), pull's week plan (Task 3) and `isPlanOnly` (this task) cover them.

```bash
git rm tests/workers/app-layout.test.ts tests/workers/no-plan.test.ts
```

- [ ] **Step 8: Typecheck.** `npm run typecheck`. Expected: no errors.

- [ ] **Step 9: Look.** `npm run dev`:
- Signed in as Kameron, Today paints, and tab taps make no request to `/api/me` (devtools, Network). A reload makes one.
- Signed in as Catherine (`npm run user` sets a password if needed), opening `/plan` lands on Today.
- Signed out, opening `/` lands on Login. (Until Task 9 the root middleware sends it there first; either way it lands.)
- Devtools offline, reload `/`: Today paints from the saved copy.

- [ ] **Step 10: Commit.** Add every file Step 6 changed to the paths.

```bash
git add app/me.ts app/routes/app-layout.tsx app/routes/today.tsx tests/unit/me.test.ts
git commit -m "The layout asks /api/me once per load; pull and the cron make the week's plan"
```

---

### Task 7: Settings reads `/api/settings`

**Files:**
- Create: `workers/api/settings.ts`, `app/settings/load.ts`
- Modify: `workers/api/push.ts`, `workers/api/router.ts`, `app/routes/settings.tsx`
- Delete: `tests/workers/settings-route.test.ts`
- Test: `tests/workers/api-settings.test.ts`, `tests/unit/settings/load.test.ts`

- [ ] **Step 1: Write the failing worker tests.** Create `tests/workers/api-settings.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { api, CATHERINE, KAMERON, setIngestToken } from "./helpers";

describe("GET /api/settings", () => {
  it("gives Kameron the other name, the ingest address, his token and the VAPID key", async () => {
    const res = await api("/api/settings", {}, KAMERON);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      otherName: "Catherine",
      ingestUrl: "http://localhost/api/ingest/steps",
      // His Shortcut still sends the v1 INGEST_TOKEN until he switches to his own.
      ingestToken: "test-ingest-token",
      vapidPublicKey: env.VAPID_PUBLIC_KEY,
    });
  });

  it("gives Catherine her own token, and no v1 fallback", async () => {
    expect(await (await api("/api/settings", {}, CATHERINE)).json()).toMatchObject({ otherName: "Kameron", ingestToken: null });
    await setIngestToken("catherine", "cat-token");
    expect(await (await api("/api/settings", {}, CATHERINE)).json()).toMatchObject({ ingestToken: "cat-token" });
  });

  it("is a 401 signed out", async () => {
    expect((await api("/api/settings")).status).toBe(401);
  });
});

describe("POST /api/push/test", () => {
  it("reports how many devices took it", async () => {
    expect(await (await api("/api/push/test", { method: "POST" }, KAMERON)).json()).toEqual({ pushed: 0 });
  });
});

describe("POST /api/backup", () => {
  it("backs up the signed-in person's database under their name", async () => {
    const mine = (await (await api("/api/backup", { method: "POST" }, KAMERON)).json()) as { backup: string };
    const hers = (await (await api("/api/backup", { method: "POST" }, CATHERINE)).json()) as { backup: string };
    expect(mine.backup).toMatch(/^backups\/kameron\/\d{4}-\d{2}-\d{2}\.json$/);
    expect(hers.backup).toMatch(/^backups\/catherine\/\d{4}-\d{2}-\d{2}\.json$/);
    expect(await env.MEDIA.get(mine.backup)).not.toBeNull();
    expect(await env.MEDIA.get(hers.backup)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing unit tests.** Create `tests/unit/settings/load.test.ts`:

```ts
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
```

- [ ] **Step 3: Run them to make sure they fail.**

```bash
npx vitest run --project workers tests/workers/api-settings.test.ts
npx vitest run --project unit tests/unit/settings/load.test.ts
```

Expected: both FAIL (`routeApi passed on /api/settings`; `Failed to load url ~/settings/load`).

- [ ] **Step 4: Write the endpoints.** Create `workers/api/settings.ts`:

```ts
import { env } from "cloudflare:workers";
import { runBackup } from "~/server/backup.server";
import { serverNow } from "~/server/clock.server";
import { currentUser } from "~/server/current-user.server";
import { allUsers } from "~/server/users.server";

/** What only the server knows for Settings. Replaces the settings loader. */
export async function settings(request: Request): Promise<Response> {
  const user = currentUser();
  const other = (await allUsers()).find((u) => u.id !== user.id) ?? null;
  return Response.json(
    {
      otherName: other?.name ?? null,
      ingestUrl: `${new URL(request.url).origin}/api/ingest/steps`,
      // Kameron's Shortcut still sends the v1 INGEST_TOKEN until he switches it to his own token.
      ingestToken: user.ingestToken ?? (user.dbBinding === "DB" ? env.INGEST_TOKEN : null),
      vapidPublicKey: env.VAPID_PUBLIC_KEY,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function backup(): Promise<Response> {
  const user = currentUser();
  return Response.json({ backup: await runBackup(env[user.dbBinding], env.MEDIA, serverNow(), user.name.toLowerCase()) });
}
```

In `workers/api/push.ts`, add `import { APP_NAME } from "~/brand";` and `import { saveSubscription, sendToAll } from "~/server/push.server";` (replacing the `saveSubscription`-only import), and append:

```ts
export async function testPush(): Promise<Response> {
  const pushed = await sendToAll(userDb(), { title: APP_NAME, body: "Notifications are working.", url: "/settings", tag: "test" });
  return Response.json({ pushed });
}
```

In `workers/api/router.ts`, add `import { backup, settings } from "./settings";`, add `testPush` to the `./push` import, and append to `ROUTES`:

```ts
  { method: "GET", path: /^\/api\/settings$/, run: settings },
  { method: "POST", path: /^\/api\/push\/test$/, run: testPush },
  { method: "POST", path: /^\/api\/backup$/, run: backup },
```

- [ ] **Step 5: Write `loadSettings`.** Create `app/settings/load.ts`:

```ts
import { redirect } from "react-router";

export type ServerSettings = { otherName: string | null; ingestUrl: string; ingestToken: string | null; vapidPublicKey: string };

/** The parts of Settings only the server knows. Null offline: the screen opens and says what needs a signal. */
export async function loadSettings(send: typeof fetch = fetch): Promise<ServerSettings | null> {
  let res: Response;
  try {
    res = await send("/api/settings");
  } catch {
    return null;
  }
  if (res.status === 401) throw redirect("/login");
  return res.ok ? ((await res.json()) as ServerSettings) : null;
}
```

- [ ] **Step 6: Run the tests to make sure they pass.**

```bash
npx vitest run --project workers tests/workers/api-settings.test.ts
npx vitest run --project unit tests/unit/settings/load.test.ts
```

Expected: PASS.

- [ ] **Step 7: Settings on the endpoints.** In `app/routes/settings.tsx`:

Replace the imports and everything down to `export default function Settings` with:

```tsx
import { useEffect, useState, type ReactNode } from "react";
import { Form, Link } from "react-router";
import { APP_NAME, COACH_NAME, pageTitle } from "~/brand";
import type { Route } from "./+types/settings";
import { Toggle } from "~/components/Toggle";
import { Icon } from "~/components/ui";
import { useMe } from "~/me";
import { loadSettings } from "~/settings/load";
import { lastReceived, reminderRows, voiceOf, type ReminderRow } from "~/settings/model";
import { useMutate, useStoreVersion, useSyncClient, useSyncStatus } from "~/sync/react";
import { btn } from "~/ui/button";
import { SectionHead } from "~/ui/SectionHead";

export const handle = { hideTabBar: true };

export function meta() {
  return [{ title: pageTitle("Settings") }];
}

export async function clientLoader() {
  return { server: await loadSettings() };
}

export function HydrateFallback() {
  return <main aria-busy="true" className="min-h-dvh" />;
}

/** POSTs to a Worker endpoint. Null with no signal or a refusal. */
async function post<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { method: "POST" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
```

(`Form` stays imported until Task 8 swaps the sign-out form.)

At the top of `Settings`, replace `const { name, otherName, hasPlan, ingestUrl, ingestToken, vapidPublicKey } = loaderData;` with:

```tsx
  const { server } = loaderData;
  const me = useMe();
  const name = me?.name ?? "";
  const hasPlan = me?.hasPlan ?? false;
  const otherName = server?.otherName ?? null;
  // The address is this site's, so it shows offline. The component only renders in the browser: the
  // clientLoader has no server twin, so the server renders HydrateFallback.
  const ingestUrl = `${window.location.origin}/api/ingest/steps`;
```

In the steps section, replace the `{ingestToken ? (...) : (...)}` block with:

```tsx
        {!server ? (
          <p className="text-[15px] text-ink-3">Needs a signal to show your token.</p>
        ) : server.ingestToken ? (
          <CopyField shown={`Token ••••••••••••${server.ingestToken.slice(-4)}`} copy={`Bearer ${server.ingestToken}`} label="Copy the Authorization header" />
        ) : (
          <p className="text-[15px] text-ink-3">No token yet.</p>
        )}
```

Replace `<NotificationsSection vapidPublicKey={vapidPublicKey} />` with `<NotificationsSection vapidPublicKey={server?.vapidPublicKey ?? null} />`.

Replace `BackupSection` with:

```tsx
function BackupSection() {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  async function backUp() {
    setBusy(true);
    const reply = await post<{ backup: string }>("/api/backup");
    setBusy(false);
    setSaved(reply?.backup ?? null);
  }
  return (
    <section aria-labelledby="backups" className="flex flex-col gap-2.5">
      <SectionHead id="backups">Backups</SectionHead>
      <p className="text-[15px] leading-[1.4] text-ink-2">Early every Sunday {APP_NAME} saves a copy of all your logs and keeps the last 12.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={backUp} disabled={busy} className={`${btn.outlinePlain} h-11 px-4`}>
          {busy ? "Backing up" : "Back up now"}
        </button>
        {saved && (
          <span aria-live="polite" className="text-[15px] text-ink-3">
            Saved <span className="tabular font-mono text-[14px]">{saved.replace(/^backups\//, "")}</span>
          </span>
        )}
      </div>
    </section>
  );
}
```

In `NotificationsSection`:
- Change its props to `{ vapidPublicKey }: { vapidPublicKey: string | null }`.
- Replace `const test = useFetcher<typeof action>();` with:

```tsx
  const [sending, setSending] = useState(false);
  const [pushed, setPushed] = useState<number | null>(null);

  async function sendTest() {
    setNote("");
    setSending(true);
    const reply = await post<{ pushed: number }>("/api/push/test");
    setSending(false);
    if (reply) setPushed(reply.pushed);
    else setNote("Could not send a test. Try again.");
  }
```

- As the first lines of `enable()`, before `setNote("")`:

```tsx
    // Checked before any await: iOS only shows the permission prompt straight from the tap.
    if (!vapidPublicKey) {
      setNote("Notifications need a signal to turn on.");
      return;
    }
```

- Delete `const pushed = test.data && "pushed" in test.data ? test.data.pushed : null;`.
- Replace the `<test.Form ...>...</test.Form>` block with:

```tsx
            <button type="button" onClick={sendTest} disabled={sending} className={`${btn.outlinePlain} h-11 flex-none px-4`}>
              {sending ? "Sending" : "Send a test"}
            </button>
```

Then delete `tests/workers/settings-route.test.ts`; `api-settings.test.ts` covers it, and reminders are store changes covered by the mutator tests.

```bash
git rm tests/workers/settings-route.test.ts
rg -n 'useFetcher|export async function (loader|action)|cloudflare:workers|\.server"' app/routes/settings.tsx
```

Expected from the `rg`: nothing.

- [ ] **Step 8: Typecheck.** `npm run typecheck`. Expected: no errors.

- [ ] **Step 9: Look.** `npm run dev`, open Settings signed in as Kameron: "Signed in as Kameron", the Catherine line, the steps address and token, "Back up now" shows a saved file name. Devtools offline, reload Settings: the page opens, the address still shows, and the token line reads "Needs a signal to show your token."

- [ ] **Step 10: Commit.**

```bash
git add workers/api/settings.ts workers/api/push.ts workers/api/router.ts app/settings/load.ts app/routes/settings.tsx tests/workers/api-settings.test.ts tests/unit/settings/load.test.ts
git commit -m "Settings reads /api/settings; test push and backup are Worker endpoints"
```

---

### Task 8: Login and sign out use the endpoints

**Files:**
- Create: `app/lib/sign-in.ts`
- Modify: `app/routes/login.tsx`, `app/routes/settings.tsx`, `app/routes.ts`
- Delete: `app/routes/logout.tsx`, `tests/workers/login.test.ts`
- Test: `tests/unit/sign-in.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/sign-in.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { signIn } from "~/lib/sign-in";

describe("signIn", () => {
  it("posts the name and password as JSON, and null means signed in", async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const send = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    expect(await signIn("Kameron", "pw", send)).toBeNull();
    expect(sent!.url).toBe("/api/login");
    expect(sent!.init.method).toBe("POST");
    expect(JSON.parse(String(sent!.init.body))).toEqual({ name: "Kameron", password: "pw" });
  });

  it("shows the server's line for a wrong password and a lockout", async () => {
    const reply = (status: number, error: string) => (async () => Response.json({ error }, { status })) as unknown as typeof fetch;
    expect(await signIn("k", "x", reply(401, "That name and password don't match."))).toBe("That name and password don't match.");
    expect(await signIn("k", "x", reply(429, "Too many tries. Wait 15 minutes."))).toBe("Too many tries. Wait 15 minutes.");
  });

  it("says when there is no signal, or the server gave no line", async () => {
    const noSignal = (async () => {
      throw new TypeError("Load failed");
    }) as unknown as typeof fetch;
    expect(await signIn("k", "x", noSignal)).toBe("Signing in needs a signal.");
    expect(await signIn("k", "x", (async () => new Response("oops", { status: 500 })) as unknown as typeof fetch)).toBe("That didn't work. Try again.");
  });
});
```

- [ ] **Step 2: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/sign-in.test.ts
```

Expected: FAIL, `Failed to load url ~/lib/sign-in`.

- [ ] **Step 3: Write `signIn`.** Create `app/lib/sign-in.ts`:

```ts
/** Signs in through the Worker, which sets the session cookie. Null means signed in; otherwise the line to show. */
export async function signIn(name: string, password: string, send: typeof fetch = fetch): Promise<string | null> {
  let res: Response;
  try {
    res = await send("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, password }) });
  } catch {
    return "Signing in needs a signal.";
  }
  if (res.status === 204) return null;
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "That didn't work. Try again.";
}
```

- [ ] **Step 4: Run the tests to make sure they pass.**

```bash
npx vitest run --project unit tests/unit/sign-in.test.ts
```

Expected: PASS.

- [ ] **Step 5: The login screen posts with `fetch`.** Replace `app/routes/login.tsx` with:

```tsx
import { useState } from "react";
import { APP_NAME, pageTitle } from "~/brand";
import { signIn } from "~/lib/sign-in";
import { btn } from "~/ui/button";

export function meta() {
  return [{ title: pageTitle("Sign in") }];
}

const FIELD = "h-[52px] rounded-[6px] border-[1.5px] border-border bg-field px-4 text-[17px] text-ink";

export default function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const problem = await signIn(String(form.get("name") ?? ""), String(form.get("password") ?? ""));
    if (problem === null) {
      // A full load, so the sync client starts for the person who just signed in.
      window.location.assign("/");
      return;
    }
    setError(problem);
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[400px] flex-col justify-center gap-8 px-5 py-12">
      <h1 className="font-display text-[68px] uppercase leading-[0.92]">{APP_NAME}.</h1>
      <form method="post" onSubmit={onSubmit} className="flex flex-col gap-3">
        <label htmlFor="name" className="text-[13px] font-semibold text-ink-3">
          Name
        </label>
        <input id="name" name="name" autoComplete="username" autoCapitalize="words" required className={FIELD} />
        <label htmlFor="password" className="mt-1 text-[13px] font-semibold text-ink-3">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={FIELD} />
        {error && (
          <p role="alert" className="text-[15px] font-semibold text-ink-2">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={`${btn.primary} mt-2 h-14 disabled:opacity-60`}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
```

The markup and classes are the old screen's; only the submit path changed.

- [ ] **Step 6: Sign out posts to `/api/logout`.** In `app/routes/settings.tsx`, replace the `<Form method="post" action="/logout">...</Form>` block with:

```tsx
      <button
        type="button"
        onClick={async () => {
          await fetch("/api/logout", { method: "POST" }).catch(() => undefined);
          window.location.assign("/login");
        }}
        className={btn.quiet}
      >
        Sign out
      </button>
```

and change the `react-router` import to `import { Link } from "react-router";`.

- [ ] **Step 7: The logout route and the old login tests go.** In `app/routes.ts`, delete `  route("logout", "routes/logout.tsx"),`. `api-account.test.ts` (Task 2) covers every case `login.test.ts` had.

```bash
git rm app/routes/logout.tsx tests/workers/login.test.ts
rg -n '"/logout"|reloadDocument|<Form' app
```

Expected from the `rg`: nothing.

- [ ] **Step 8: Typecheck.** `npm run typecheck`. Expected: no errors.

- [ ] **Step 9: Look.** `npm run dev`:
- A wrong password shows "That name and password don't match." under the fields, and the fields keep their values.
- The right password lands on Today as that person.
- Settings, Sign out lands on Login; going back to `/` lands on Login again.

- [ ] **Step 10: Commit.**

```bash
git add app/lib/sign-in.ts app/routes/login.tsx app/routes/settings.tsx app/routes.ts tests/unit/sign-in.test.ts
git commit -m "Login and sign out post to the Worker endpoints"
```

---

### Task 9: No route module touches the server

The root middleware goes, `authenticate` drops what only the middleware needed, unknown API paths get a 404, and a guard test keeps every route module free of server exports and imports. P4f's build would fail on any that slipped back.

**Files:**
- Modify: `app/root.tsx`, `app/server/auth.server.ts`, `app/server/current-user.server.ts`, `workers/api/auth.ts`, `workers/api/router.ts`, `wrangler.jsonc`, `tests/workers/auth.test.ts`, `tests/workers/api-account.test.ts`
- Test: `tests/unit/route-modules.test.ts`

- [ ] **Step 1: Write the guard test.** Create `tests/unit/route-modules.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP = join(import.meta.dirname, "../../app");
const MODULES = ["root.tsx", ...readdirSync(join(APP, "routes")).filter((f) => /\.tsx?$/.test(f)).map((f) => `routes/${f}`)];

// SPA mode refuses these in any route but the root, and the root needs none of them.
const SERVER_EXPORT = /export\s+(async\s+)?(function|const|let)\s+(loader|action|middleware|headers)\b/;
// `import type` is erased, so only value imports count.
const SERVER_IMPORT = /^import\s+(?!type\b)[^;]*?from\s+"(cloudflare:workers|~\/server\/[^"]+|[^"]+\.server)"/m;

describe("route modules", () => {
  it.each(MODULES)("%s exports no loader, action, middleware or headers", (file) => {
    expect(readFileSync(join(APP, file), "utf8")).not.toMatch(SERVER_EXPORT);
  });

  it.each(MODULES)("%s imports nothing server-only", (file) => {
    expect(readFileSync(join(APP, file), "utf8")).not.toMatch(SERVER_IMPORT);
  });
});
```

- [ ] **Step 2: Write the failing worker tests.** In `tests/workers/api-account.test.ts`, append to `describe("routeApi", ...)`:

```ts
  it("answers an unknown API or media path with a JSON 404, never the app", async () => {
    for (const path of ["/api/nope", "/api/sync", "/media"]) {
      const res = (await routeApi(new Request(`http://localhost${path}`)))!;
      expect(res.status, path).toBe(404);
      expect(await res.json(), path).toEqual({ error: "Not found" });
    }
  });
```

Replace `tests/workers/auth.test.ts`'s `describe("authenticate", ...)` block (keep `cookieWith`, the imports it still uses, and the `request scope` block) with:

```ts
describe("authenticate", () => {
  it("is null when signed out, on any path", async () => {
    expect(await authenticate(new Request("http://localhost/plan"))).toBeNull();
    expect(await authenticate(new Request("http://localhost/api/sync/pull?since=0&clientId=abcdefgh"))).toBeNull();
  });

  it("resolves the user in the session", async () => {
    const auth = await authenticate(new Request("http://localhost/", { headers: { Cookie: await cookieWith({ userId: 2 }) } }));
    expect(auth?.user.name).toBe("Catherine");
    expect(auth?.setCookie).toBeUndefined();
  });

  it("upgrades a v1 cookie to Kameron without signing him out", async () => {
    const auth = await authenticate(new Request("http://localhost/", { headers: { Cookie: await cookieWith({ signedIn: true }) } }));
    expect(auth?.user.name).toBe("Kameron");
    const upgraded = await getSession(auth!.setCookie!.split(";")[0]);
    expect(upgraded.get("userId")).toBe(1);
    expect(upgraded.get("signedIn")).toBeUndefined();
  });

  it("is null for a user id that no longer exists", async () => {
    expect(await authenticate(new Request("http://localhost/", { headers: { Cookie: await cookieWith({ userId: 99 }) } }))).toBeNull();
  });
});
```

Delete the now-unused `thrown` helper.

- [ ] **Step 3: Run them to make sure they fail.**

```bash
npx vitest run --project unit tests/unit/route-modules.test.ts
npx vitest run --project workers tests/workers/auth.test.ts tests/workers/api-account.test.ts
```

Expected: FAIL. `root.tsx` matches both patterns (its `middleware` and its `~/server/` imports). `authenticate` throws instead of returning null. `/api/nope` gets null from `routeApi`.

- [ ] **Step 4: `authenticate` returns null when signed out.** Replace `app/server/auth.server.ts` with:

```ts
import { commitSession, getSession } from "./session.server";
import { userByBinding, userById, type User } from "./users.server";

export type Auth = { user: User; setCookie?: string };

/** The signed-in person for a request, or null when signed out. A v1 cookie is upgraded to Kameron's id. */
export async function authenticate(request: Request): Promise<Auth | null> {
  const session = await getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");
  if (userId) {
    const user = await userById(userId);
    return user ? { user } : null;
  }
  if (session.get("signedIn")) {
    const user = await userByBinding("DB");
    if (!user) return null;
    session.unset("signedIn");
    session.set("userId", user.id);
    return { user, setCookie: await commitSession(session) };
  }
  return null;
}

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}
```

Replace the body of `withUser` in `workers/api/auth.ts`, down to the `401` line, with:

```ts
  const auth = await authenticate(request);
  if (!auth) return Response.json({ error: "Signed out" }, { status: 401 });
```

- [ ] **Step 5: Unknown API paths are a 404.** In `workers/api/router.ts`, replace `if (!onPath.length) return null;` with:

```ts
  if (!onPath.length) return /^\/(api|media)(\/|$)/.test(pathname) ? Response.json({ error: "Not found" }, { status: 404 }) : null;
```

- [ ] **Step 6: The root loses its middleware and gains Reload.** In `app/root.tsx`:
- Delete the `middleware` export and the two imports `~/server/auth.server` and `~/server/current-user.server`.
- Add `import { btn } from "~/ui/button";`.
- Replace the `return (...)` of `ErrorBoundary` with:

```tsx
  return (
    <main className="mx-auto max-w-md px-4 pt-24">
      <h1 className="text-3xl font-bold">{message}</h1>
      <p className="mt-2 text-ink-3">{details}</p>
      {/* A phone still on an older build can fail to load a screen after a deploy. A full load picks up the new one. */}
      <button type="button" onClick={() => window.location.reload()} className={`${btn.outline} mt-6 h-14 w-full text-[17px]`}>
        Reload
      </button>
    </main>
  );
```

- [ ] **Step 7: Comments that named the middleware.** In `app/server/current-user.server.ts`, change `// Tests call loaders and actions directly, without the root middleware. Production leaves TEST_USER_DB empty.` to `// Tests call server code directly, outside a signed-in request. Production leaves TEST_USER_DB empty.` In `wrangler.jsonc`, change `TEST_USER_DB: lets tests call loaders without the auth middleware.` to `TEST_USER_DB: lets tests call server code outside a signed-in request.`

- [ ] **Step 8: Run the tests to make sure they pass.**

```bash
npx vitest run --project unit tests/unit/route-modules.test.ts
npx vitest run --project workers tests/workers/auth.test.ts tests/workers/api-account.test.ts tests/workers/api-sync.test.ts tests/workers/api-media.test.ts
```

Expected: PASS. If the guard names a route module, that module still has a server export or import: move it to an endpoint the way Tasks 3 to 8 did. Nothing in P4e should be left.

- [ ] **Step 9: Nothing else calls the old shapes.**

```bash
rg -n 'serverLoader|useLoaderData|useActionData|useFetcher|from "~/routes/' app tests
npm run typecheck
```

Expected: the `rg` prints nothing, or only `tests/workers/*` files for screens P4b to P4d own (none should remain). Typecheck: no errors.

- [ ] **Step 10: Look.** `npm run dev`. Signed out, `/` and `/plan` land on Login (now through the layout's `/api/me` 401, not the server). Signed in, every tab opens. `curl -s localhost:5173/api/nope` prints `{"error":"Not found"}`. (Use the port `npm run dev` prints.)

- [ ] **Step 11: Commit.**

```bash
git add app/root.tsx app/server/auth.server.ts app/server/current-user.server.ts workers/api/auth.ts workers/api/router.ts wrangler.jsonc tests/unit/route-modules.test.ts tests/workers/auth.test.ts tests/workers/api-account.test.ts
git commit -m "No route module has a loader, action or middleware; the error page offers Reload"
```

---

### Task 10: Full suite, ship, and check on the wire

- [ ] **Step 1: Run the whole suite once.**

```bash
npm run typecheck && npm test
```

Expected: all green. Fix only the failing files, then re-run those files only.

- [ ] **Step 2: Push the branch and hand over the commit.**

```bash
git push origin v2/p4-checkin-plan-progress-library
git rev-parse HEAD
```

Report the sha to Kameron and wait for him to say ship. No migrations, no new secrets.

- [ ] **Step 3: Ship that commit.** Only after Kameron says so:

```bash
git push origin <sha>:main
gh api repos/kameronpduhon/rocky-the-coach/commits/<sha>/check-suites --jq '.check_suites[] | "\(.app.name) \(.status) \(.conclusion)"'
```

Expected within a few minutes: the Workers Builds suite `completed success`. If it sits `queued` for more than 6 minutes, tell Kameron; he runs `! npm run deploy`.

- [ ] **Step 4: Check on the wire.**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://kampduh.com/api/me
curl -s -o /dev/null -w '%{http_code}\n' 'https://kampduh.com/api/sync/pull?since=0&clientId=wirecheck1'
curl -s -o /dev/null -w '%{http_code}\n' https://kampduh.com/api/nope
curl -s -w '\n%{http_code}\n' -X POST https://kampduh.com/api/login -H 'Content-Type: application/json' -d '{"name":"wire-check","password":"wrong"}'
```

Expected: `401`, `401`, `404`, then `{"error":"That name and password don't match."}` and `401`. Run the login check once only: each run is a failed try against this machine's IP, and 5 in 15 minutes locks it out.

Then confirm the new login chunk is live:

```bash
M=$(curl -s https://kampduh.com/login | grep -o '/assets/manifest-[A-Za-z0-9_-]*\.js' | head -1); echo "$M"
for c in $(curl -s "https://kampduh.com$M" | grep -o '/assets/login-[A-Za-z0-9_-]*\.js' | sort -u); do echo "$c $(curl -s "https://kampduh.com$c" | grep -c '/api/login')"; done
```

Expected: a manifest path, then at least one login chunk with a count of 1 or more. A count of 0 on every chunk means the old build is still serving.

- [ ] **Step 5: Report.** One or two sentences to Kameron: P4e is live, and P4f (`docs/superpowers/plans/2026-10-28-p4f-spa-mode.md`) is next.
