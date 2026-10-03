# M1: Foundation Implementation Plan

> **For agentic workers:** implement this plan task-by-task with the `executing-plans` skill. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployed, password-protected Rocky shell at `https://kampduh.com`: React Router v8 on Cloudflare Workers with D1, R2, the full database schema, all starter content bundled and validated, the design tokens and glass styles, and the four-tab navigation.

**Architecture:** One Worker serves SSR pages, resource routes, and cron. Content (plan, foods, meals, exercises, messages) is JSON in `content/`, bundled at build time and validated by unit tests. User data lives in D1 via Drizzle. Auth is a single password and a 400-day signed cookie, enforced by root route middleware.

**Tech Stack:** React Router 8.4, React 19, Vite 8, `@cloudflare/vite-plugin`, Wrangler 4.147, Tailwind CSS 4.3, Drizzle ORM 0.45 + drizzle-kit 0.31, Zod, Vitest 4.1.11 + `@cloudflare/vitest-plugin` 1.3.6, TypeScript 5.9. These versions were verified together on this Mac on 2026-10-03 (scratch project: `/private/tmp/claude-501/-Users-kameron-Code-rocky-the-coach/377dee54-a136-4844-b190-a2bf5b20371d/scratchpad/stack-probe/app`, may be gone by build time).

---

## Before you start (Kameron does these, the build session asks if not done)

1. **Cloudflare plan:** upgrade the account to Workers Paid ($5/month) if Kameron approved it. Free works for a first deploy but will intermittently fail SSR requests (10 ms CPU cap).
2. **R2:** in the Cloudflare dashboard, R2 > enable R2 (adds the R2 subscription; free tier usage).
3. **Wrangler login:** Kameron runs `! npx wrangler login` in the session (browser OAuth).
4. **Apex DNS:** in the `kampduh.com` zone, delete any existing apex `CNAME` (and apex `A`/`AAAA` records if the custom domain attach complains).

## Ground rules for every milestone

- Env and bindings: `import { env } from "cloudflare:workers"`. There is no `context.cloudflare.env` in React Router v8.
- Route types: `import type { Route } from "./+types/<file>"`. Routes are registered by hand in `app/routes.ts`.
- `npm install` of new dev dependencies may crash on npm 10.9.8 with `Cannot read properties of null (reading 'edgesOut')`. Add `--legacy-peer-deps` when it does.
- No em dashes anywhere (code comments, copy, commits). No `Co-Authored-By` lines in commits.
- `npm run dev` is the way to look at the app. Do not use `npm run build` to check UI work.
- Workers tests share storage within a file and start clean per file.

## File map (created in this milestone)

| Path | Responsibility |
|---|---|
| `wrangler.jsonc` | Worker name, domain, D1, R2, secrets, crons |
| `workers/app.ts` | Worker entry: fetch (React Router) and scheduled |
| `vitest.config.ts` | `unit` and `workers` test projects |
| `drizzle.config.ts`, `drizzle/` | Schema migrations |
| `app/db/schema.ts`, `app/db/client.ts` | Drizzle schema and client |
| `app/content/schema.ts` | Zod schemas and types for content files |
| `app/content/index.ts` | Loads bundled content into typed maps |
| `content/*.json`, `content/meals/*.json` | Starter content |
| `app/server/session.server.ts` | Cookie session storage |
| `app/server/auth.server.ts` | Password check, rate limit, route guard |
| `app/routes.ts`, `app/root.tsx` | Routes, document, middleware |
| `app/routes/login.tsx`, `logout.tsx`, `app-layout.tsx` | Auth screens and tab layout |
| `app/routes/today.tsx`, `plan.tsx`, `progress.tsx`, `library.tsx`, `settings.tsx` | Placeholder screens (filled in M3 to M6) |
| `app/components/TabBar.tsx`, `app/components/ui.tsx` | Navigation and shared UI primitives |
| `app/app.css`, `app/styles/tokens.css`, `app/styles/glass.css` | Design tokens and glass recipes |
| `tests/unit/**`, `tests/workers/**` | Tests |

---

### Task 1: Scaffold the app into the repo

**Files:** everything the template generates, merged into the repo root.

- [ ] **Step 1: Scaffold in a temp folder** (the repo is not empty, so do not scaffold in place)

```bash
cd /tmp && rm -rf rocky-scaffold && mkdir rocky-scaffold && cd rocky-scaffold
CI=true npx -y create-cloudflare@2.73.2 rocky --framework=react-router --platform=workers --lang=ts --no-deploy --no-git --no-open --agents --no-auto-update -y < /dev/null
```

Expected: a `rocky/` folder with `app/`, `workers/app.ts`, `wrangler.jsonc`, `package.json` (react-router 8.4.x), and `node_modules/`.

- [ ] **Step 2: Copy into the repo, keeping our README and docs**

```bash
rsync -a --exclude README.md --exclude node_modules /tmp/rocky-scaffold/rocky/ /Users/kameron/Code/rocky-the-coach/
cd /Users/kameron/Code/rocky-the-coach
rm -rf app/welcome
cat > app/routes/home.tsx <<'EOF2'
export default function Home() {
  return <p>Rocky</p>;
}
EOF2
npm install
```

- [ ] **Step 3: Install project dependencies**

```bash
npm install drizzle-orm zod
npm install -D drizzle-kit tsx vitest@4.1.11 @cloudflare/vitest-plugin@1.3.6 --legacy-peer-deps
```

- [ ] **Step 4: Replace the scripts block in `package.json`**

```json
"scripts": {
  "build": "react-router build",
  "dev": "react-router dev",
  "typecheck": "wrangler types && react-router typegen && tsc -b",
  "deploy": "npm run build && wrangler deploy",
  "preview": "npm run build && vite preview",
  "cf-typegen": "wrangler types",
  "postinstall": "wrangler types",
  "test": "vitest run",
  "test:watch": "vitest",
  "db:generate": "drizzle-kit generate",
  "db:migrate:local": "wrangler d1 migrations apply rocky-db --local",
  "db:migrate:remote": "wrangler d1 migrations apply rocky-db --remote"
}
```

- [ ] **Step 5: Create the Cloudflare resources** (needs `wrangler login` done)

```bash
npx wrangler d1 create rocky-db
npx wrangler r2 bucket create rocky-media
```

Expected: `d1 create` prints a `database_id` (a UUID). Copy it for the next step. `r2 bucket create` prints `Created bucket 'rocky-media'` (if it errors about R2 not being enabled, stop and ask Kameron to enable R2 in the dashboard).

- [ ] **Step 6: Replace `wrangler.jsonc`** (paste the real `database_id`)

```jsonc
{
	"$schema": "node_modules/wrangler/config-schema.json",
	"name": "rocky",
	"compatibility_date": "2026-10-01",
	"main": "./workers/app.ts",
	"routes": [{ "pattern": "kampduh.com", "custom_domain": true }],
	"d1_databases": [
		{ "binding": "DB", "database_name": "rocky-db", "database_id": "PASTE-THE-ID-FROM-STEP-5", "migrations_dir": "drizzle" }
	],
	"r2_buckets": [{ "binding": "MEDIA", "bucket_name": "rocky-media" }],
	"secrets": {
		"required": ["APP_PASSWORD", "SESSION_SECRET", "INGEST_TOKEN", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"]
	},
	"triggers": { "crons": ["*/5 * * * *", "0 9 * * 0"] },
	"observability": { "enabled": true },
	"upload_source_maps": true
}
```

The first cron drives reminders (M6). The second is the weekly backup, Sunday 09:00 UTC, which is 3am or 4am in Chicago (M6).

- [ ] **Step 7: Local secrets**

Create `.dev.vars.example` (committed):

```bash
APP_PASSWORD=""
SESSION_SECRET=""
INGEST_TOKEN=""
VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
```

Create `.dev.vars` (gitignored by the template) with real local values:

```bash
cat > .dev.vars <<EOF
APP_PASSWORD="rocky-local"
SESSION_SECRET="$(openssl rand -hex 32)"
INGEST_TOKEN="$(openssl rand -hex 24)"
VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
EOF
```

(VAPID keys are generated in M6.)

- [ ] **Step 8: Worker entry with a scheduled handler**

Replace `workers/app.ts`:

```ts
import { createRequestHandler } from "react-router";
import { runScheduled } from "../app/jobs/scheduled";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request) {
    return requestHandler(request);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(env, controller.cron, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
```

Create `app/jobs/scheduled.ts` (M6 fills in the jobs):

```ts
export async function runScheduled(_env: Env, cron: string, now: Date): Promise<void> {
  console.log(`[cron] ${cron} at ${now.toISOString()}`);
}
```

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: exits 0. (`app/routes/home.tsx` is the one-line stand-in from Step 2; Task 8 deletes it.)

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Scaffold React Router app on Cloudflare Workers"
```

---

### Task 2: Test setup

**Files:**
- Create: `vitest.config.ts`, `tests/workers/apply-migrations.ts`, `tests/workers/env.d.ts`
- Modify: `tsconfig.cloudflare.json`, `tsconfig.node.json`
- Test: `tests/unit/smoke.test.ts`, `tests/workers/smoke.test.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const alias = { "~": path.resolve(import.meta.dirname, "app") };

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "drizzle"));
  return {
    test: {
      projects: [
        {
          resolve: { alias },
          test: { name: "unit", include: ["tests/unit/**/*.test.ts"], environment: "node" },
        },
        {
          resolve: { alias },
          plugins: [
            cloudflareTest({
              wrangler: { configPath: "./wrangler.jsonc" },
              miniflare: {
                bindings: {
                  TEST_MIGRATIONS: migrations,
                  APP_PASSWORD: "test-password",
                  SESSION_SECRET: "test-session-secret",
                  INGEST_TOKEN: "test-ingest-token",
                  VAPID_PUBLIC_KEY: "BOr9r1kQdvy1W8e1ZJHhq2bBo6S7gQkC3n2Ucg5w8yW8mGg9x2fV9bXJb2kq3pY2c4cJ7aZbS0m3v5Q6nQ1tY2U",
                  VAPID_PRIVATE_KEY: "test-private-key",
                },
              },
            }),
          ],
          test: {
            name: "workers",
            include: ["tests/workers/**/*.test.ts"],
            setupFiles: ["./tests/workers/apply-migrations.ts"],
          },
        },
      ],
    },
  };
});
```

- [ ] **Step 2: Migration setup and env typing for workers tests**

```ts
// tests/workers/apply-migrations.ts
import { applyD1Migrations, env } from "cloudflare:test";
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

```ts
// tests/workers/env.d.ts
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
```

- [ ] **Step 3: Include tests and configs in TypeScript**

In `tsconfig.cloudflare.json`, add `"tests/**/*"` to `include` and `"@cloudflare/vitest-plugin/types"` to `compilerOptions.types` (so it reads `["vite/client", "@cloudflare/vitest-plugin/types"]`).

In `tsconfig.node.json`, set `"include": ["vite.config.ts", "vitest.config.ts", "drizzle.config.ts", "scripts/**/*.ts"]`.

- [ ] **Step 4: Write smoke tests**

```ts
// tests/unit/smoke.test.ts
import { expect, it } from "vitest";
it("runs unit tests in node", () => {
  expect(typeof process.versions.node).toBe("string");
});
```

```ts
// tests/workers/smoke.test.ts
import { env } from "cloudflare:test";
import { expect, it } from "vitest";
it("has D1 and R2 bindings", async () => {
  expect(await env.DB.prepare("select 1 as one").first()).toEqual({ one: 1 });
  await env.MEDIA.put("smoke.txt", "ok");
  expect(await (await env.MEDIA.get("smoke.txt"))!.text()).toBe("ok");
});
```

- [ ] **Step 5: Create an empty migrations folder so `readD1Migrations` works before Task 4**

```bash
mkdir -p drizzle && touch drizzle/.gitkeep
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS, 2 tests across projects `unit` and `workers`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add unit and workers test projects"
```

---

### Task 3: Design tokens, glass styles, document

**Files:**
- Create: `app/styles/tokens.css`, `app/styles/glass.css`
- Modify: `app/app.css`, `app/root.tsx`

- [ ] **Step 1: Tokens** (values from `docs/spec.md`, "Visual system")

```css
/* app/styles/tokens.css */
:root {
  --bg: #f2f2f7;
  --card: #ffffff;
  --fill: #e5e5ea;
  --separator: #c6c6c8;
  --label: #000000;
  --label-2: #6c6c70;
  --label-3: #6c6c70;
  --calories: #d70f45;
  --protein: #0071a4;
  --steps: #248a3d;
  --warn: #b25000;
  --glass-fill: rgba(255, 255, 255, 0.6);
  --glass-fill-strong: rgba(250, 250, 252, 0.72);
  --glass-border: rgba(0, 0, 0, 0.08);
  --glass-highlight: rgba(255, 255, 255, 0.9);
  --glass-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  --glass-selected: rgba(0, 0, 0, 0.08);
  --prominent-fill: #000000;
  --prominent-label: #ffffff;
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #000000;
    --card: #1c1c1e;
    --fill: #2c2c2e;
    --separator: #38383a;
    --label: #ffffff;
    --label-2: #98989f;
    --label-3: #8e8e93;
    --calories: #ff375f;
    --protein: #64d2ff;
    --steps: #30d158;
    --warn: #ff9f0a;
    --glass-fill: rgba(255, 255, 255, 0.1);
    --glass-fill-strong: rgba(40, 40, 44, 0.55);
    --glass-border: rgba(255, 255, 255, 0.22);
    --glass-highlight: rgba(255, 255, 255, 0.28);
    --glass-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
    --glass-selected: rgba(255, 255, 255, 0.14);
    --prominent-fill: rgba(255, 255, 255, 0.94);
    --prominent-label: #000000;
    color-scheme: dark;
  }
}
```

- [ ] **Step 2: Glass recipes**

```css
/* app/styles/glass.css */
@layer components {
  .glass {
    background: var(--glass-fill);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 0.5px solid var(--glass-border);
    box-shadow: inset 0 1px 0 var(--glass-highlight), var(--glass-shadow);
  }
  .glass-bar {
    background: var(--glass-fill-strong);
    backdrop-filter: blur(28px) saturate(180%);
    -webkit-backdrop-filter: blur(28px) saturate(180%);
    border: 0.5px solid var(--glass-border);
    box-shadow: inset 0 1px 0 var(--glass-highlight), inset 0 -1px 0 rgba(255, 255, 255, 0.06), var(--glass-shadow);
  }
  /* Over photos: always the dark recipe so white icons read on any image */
  .glass-on-image {
    color: #ffffff;
    background: rgba(30, 30, 32, 0.35);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 0.5px solid rgba(255, 255, 255, 0.3);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 8px 24px rgba(0, 0, 0, 0.35);
  }
  .btn-prominent {
    background: var(--prominent-fill);
    color: var(--prominent-label);
    box-shadow: inset 0 1px 0 var(--glass-highlight), var(--glass-shadow);
  }
}
```

- [ ] **Step 3: Replace `app/app.css`**

```css
@import "tailwindcss" source(".");
@import "./styles/tokens.css";
@import "./styles/glass.css";

@theme inline {
  --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
  --color-bg: var(--bg);
  --color-card: var(--card);
  --color-fill: var(--fill);
  --color-separator: var(--separator);
  --color-label: var(--label);
  --color-label-2: var(--label-2);
  --color-label-3: var(--label-3);
  --color-calories: var(--calories);
  --color-protein: var(--protein);
  --color-steps: var(--steps);
  --color-warn: var(--warn);
}

html,
body {
  background: var(--bg);
  color: var(--label);
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
}

.tabular {
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4: Replace `app/root.tsx`** (no web fonts; PWA meta; middleware is added in Task 7)

```tsx
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
];

export function meta() {
  return [{ title: "Rocky" }];
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#f2f2f7" media="(prefers-color-scheme: light)" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Rocky" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong";
  let details = "Try again in a moment.";
  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Not found" : "Error";
    details = error.status === 404 ? "That page does not exist." : error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
  }
  return (
    <main className="mx-auto max-w-md px-4 pt-24">
      <h1 className="text-3xl font-bold">{message}</h1>
      <p className="mt-2 text-label-2">{details}</p>
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add design tokens, glass styles, and PWA document head"
```

---

### Task 4: Database schema

**Files:**
- Create: `drizzle.config.ts`, `app/db/schema.ts`, `app/db/client.ts`
- Create (generated): `drizzle/0000_init.sql`, `drizzle/meta/*`
- Test: `tests/workers/schema.test.ts`

- [ ] **Step 1: Drizzle config**

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({ dialect: "sqlite", schema: "./app/db/schema.ts", out: "./drizzle" });
```

- [ ] **Step 2: Schema** (tables from `docs/spec.md`, "Data model")

```ts
// app/db/schema.ts
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

const bool = (name: string) => integer(name, { mode: "boolean" });

export const mealState = sqliteTable("meal_state", {
  slug: text("slug").primaryKey(),
  photoKey: text("photo_key"),
  restedUntil: text("rested_until"),
});

export const plannedMeals = sqliteTable(
  "planned_meals",
  {
    date: text("date").notNull(),
    slot: text("slot").notNull(),
    mealSlug: text("meal_slug").notNull(),
    swapped: bool("swapped").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.date, t.slot] })],
);

export const mealLogs = sqliteTable(
  "meal_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    slot: text("slot"),
    mealSlug: text("meal_slug"),
    name: text("name").notNull(),
    category: text("category").notNull(),
    kcal: integer("kcal").notNull(),
    proteinG: integer("protein_g").notNull(),
    relaxed: bool("relaxed").notNull().default(false),
    portions: integer("portions").notNull().default(1),
    loggedAt: text("logged_at").notNull(),
  },
  (t) => [index("meal_logs_date").on(t.date)],
);

export const batches = sqliteTable("batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mealSlug: text("meal_slug").notNull(),
  portions: integer("portions").notNull(),
  cookedWeightG: integer("cooked_weight_g").notNull(),
  portionG: integer("portion_g").notNull(),
  createdOn: text("created_on").notNull(),
  portionsLeft: integer("portions_left").notNull(),
});

export const workoutSessions = sqliteTable(
  "workout_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    templateId: text("template_id").notNull(),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
  },
  (t) => [index("workout_sessions_date").on(t.date)],
);

export const setLogs = sqliteTable(
  "set_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id").notNull(),
    exerciseId: text("exercise_id").notNull(),
    position: integer("position").notNull(),
    setNumber: integer("set_number").notNull(),
    weightLb: real("weight_lb").notNull(),
    reps: integer("reps").notNull(),
    loggedAt: text("logged_at").notNull(),
  },
  (t) => [index("set_logs_exercise").on(t.exerciseId), index("set_logs_session").on(t.sessionId)],
);

export const exerciseOverrides = sqliteTable(
  "exercise_overrides",
  {
    templateId: text("template_id").notNull(),
    position: integer("position").notNull(),
    exerciseId: text("exercise_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.templateId, t.position] })],
);

export const exerciseSwaps = sqliteTable(
  "exercise_swaps",
  {
    date: text("date").notNull(),
    templateId: text("template_id").notNull(),
    position: integer("position").notNull(),
    exerciseId: text("exercise_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.templateId, t.position] })],
);

export const weighIns = sqliteTable("weigh_ins", {
  date: text("date").primaryKey(),
  weightLb: real("weight_lb").notNull(),
  loggedAt: text("logged_at").notNull(),
});

export const waistLogs = sqliteTable("waist_logs", {
  date: text("date").primaryKey(),
  inches: real("inches").notNull(),
});

export const stepsDaily = sqliteTable("steps_daily", {
  date: text("date").primaryKey(),
  steps: integer("steps").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const targets = sqliteTable("targets", {
  effectiveFrom: text("effective_from").primaryKey(),
  kcal: integer("kcal").notNull(),
  proteinG: integer("protein_g").notNull(),
  stepGoal: integer("step_goal").notNull(),
});

export const checkIns = sqliteTable("check_ins", {
  weekStart: text("week_start").primaryKey(),
  avgWeight: real("avg_weight"),
  change: real("change"),
  adherence: integer("adherence").notNull(),
  outcome: text("outcome").notNull(),
  completedAt: text("completed_at").notNull(),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: text("created_at").notNull(),
});

export const reminderSettings = sqliteTable("reminder_settings", {
  kind: text("kind").primaryKey(),
  enabled: bool("enabled").notNull(),
  time: text("time").notNull(),
});

export const notificationsSent = sqliteTable(
  "notifications_sent",
  {
    kind: text("kind").notNull(),
    date: text("date").notNull(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.date] })],
);

export const loginAttempts = sqliteTable("login_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ip: text("ip").notNull(),
  attemptedAt: text("attempted_at").notNull(),
});

export const groceryChecks = sqliteTable(
  "grocery_checks",
  {
    weekStart: text("week_start").notNull(),
    foodId: text("food_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.weekStart, t.foodId] })],
);
```

- [ ] **Step 3: Client**

```ts
// app/db/client.ts
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}
export type Db = ReturnType<typeof getDb>;
```

- [ ] **Step 4: Generate and apply the migration**

```bash
rm drizzle/.gitkeep
npm run db:generate -- --name init
npm run db:migrate:local
```

Expected: `drizzle/0000_init.sql` with 18 `CREATE TABLE` statements; wrangler reports the migration applied locally.

- [ ] **Step 5: Write the schema test**

```ts
// tests/workers/schema.test.ts
import { env } from "cloudflare:test";
import { expect, it } from "vitest";

it("creates every table", async () => {
  const { results } = await env.DB.prepare("select name from sqlite_master where type = 'table' and name not like '\\_%' escape '\\' and name != 'sqlite_sequence' and name != 'd1_migrations' order by name").all<{ name: string }>();
  expect(results.map((r) => r.name)).toEqual([
    "batches", "check_ins", "exercise_overrides", "exercise_swaps", "grocery_checks", "login_attempts",
    "meal_logs", "meal_state", "notifications_sent", "planned_meals", "push_subscriptions", "reminder_settings",
    "set_logs", "steps_daily", "targets", "waist_logs", "weigh_ins", "workout_sessions",
  ]);
});
```

- [ ] **Step 6: Run it**

Run: `npx vitest run --project workers tests/workers/schema.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add D1 schema and initial migration"
```

---

### Task 5: Content schemas and loader

**Files:**
- Create: `app/content/schema.ts`, `app/content/index.ts`

- [ ] **Step 1: Zod schemas and types**

```ts
// app/content/schema.ts
import { z } from "zod";

export const SectionSchema = z.enum(["meat-seafood", "dairy-eggs", "produce", "pantry"]);

export const FoodSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  fdcId: z.number().int().nullable(),
  source: z.enum(["sr-legacy", "foundation", "label"]),
  state: z.enum(["raw", "cooked", "as-is"]),
  kcalPer100: z.number().nonnegative(),
  proteinPer100: z.number().nonnegative(),
  section: SectionSchema,
  eachG: z.number().positive().optional(),
  eachLabel: z.string().optional(),
});
export type Food = z.infer<typeof FoodSchema>;

export const MealSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  pool: z.enum(["breakfast", "main", "snack", "dessert"]),
  mode: z.enum(["any", "weekend"]),
  tags: z.array(z.string()),
  ingredients: z
    .array(z.object({ food: z.string(), grams: z.number().positive(), note: z.string().optional() }))
    .min(1),
  steps: z.array(z.string()).min(1),
  source: z.string(),
});
export type Meal = z.infer<typeof MealSchema>;

export const ExerciseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  dbId: z.string(),
  group: z.enum(["chest", "back", "biceps", "triceps", "quads", "hamstrings", "shoulder-press", "side-delts", "rear-delts"]),
  equipment: z.enum(["machine", "cable", "dumbbell", "barbell", "body-weight"]),
  compound: z.boolean(),
  increment: z.union([z.literal(5), z.literal(10)]),
});
export type Exercise = z.infer<typeof ExerciseSchema>;

const TemplateSchema = z.object({
  name: z.string(),
  kind: z.enum(["gym", "optional", "plan-b"]),
  exercises: z.array(z.object({ exercise: z.string(), repMin: z.number().int(), repMax: z.number().int() })).min(1),
});
export type Template = z.infer<typeof TemplateSchema>;

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);

export const PlanSchema = z.object({
  phaseStart: z.string(),
  weekTypes: z.record(z.string(), z.enum(["standard", "deload", "maintenance", "checkpoint"])),
  relaxedDays: z.array(z.string()),
  training: z.record(z.string(), z.string()),
  optional: z.record(z.string(), z.string()),
  planB: z.string(),
  startingTargets: z.object({ kcal: z.number(), proteinG: z.number(), stepGoal: z.number() }),
  maintenanceKcal: z.number(),
  slotTimes: z.object({ breakfast: hhmm, lunch: hhmm, snack: hhmm, dinner: hhmm, dessert: hhmm }),
  poolRanges: z.record(
    z.enum(["breakfast", "main", "snack", "dessert"]),
    z.object({ kcalMin: z.number(), kcalMax: z.number(), proteinMin: z.number() }),
  ),
  templates: z.record(z.string(), TemplateSchema),
});
export type Plan = z.infer<typeof PlanSchema>;

export const MessagesSchema = z.record(z.string(), z.array(z.string()).min(1));
```

- [ ] **Step 2: Loader** (bundled at build time; Vite resolves the glob)

```ts
// app/content/index.ts
import exercisesJson from "../../content/exercises.json";
import foodsJson from "../../content/foods.json";
import messagesJson from "../../content/messages.json";
import planJson from "../../content/plan.json";
import { mealMacros } from "~/domain/macros";
import { ExerciseSchema, FoodSchema, MealSchema, MessagesSchema, PlanSchema, type Exercise, type Food, type Meal } from "./schema";

const mealFiles = import.meta.glob("../../content/meals/*.json", { eager: true, import: "default" });

export const plan = PlanSchema.parse(planJson);
export const messages = MessagesSchema.parse(messagesJson);
export const foods: Map<string, Food> = new Map(FoodSchema.array().parse(foodsJson).map((f) => [f.id, f]));
export const exercises: Map<string, Exercise> = new Map(ExerciseSchema.array().parse(exercisesJson).map((e) => [e.id, e]));

export interface MealWithMacros extends Meal {
  kcal: number;
  protein: number;
}

const foodMacros = new Map([...foods].map(([id, f]) => [id, { kcalPer100: f.kcalPer100, proteinPer100: f.proteinPer100 }]));

export const meals: Map<string, MealWithMacros> = new Map(
  Object.values(mealFiles).map((raw) => {
    const meal = MealSchema.parse(raw);
    const m = mealMacros(meal.ingredients.map((i) => ({ foodId: i.food, grams: i.grams })), foodMacros);
    return [meal.slug, { ...meal, kcal: m.kcal, protein: m.protein }];
  }),
);

export function exerciseImage(ex: Exercise, frame: 0 | 1): string {
  return `/media/exercises/${ex.dbId}/${frame}.jpg`;
}
```

This imports `~/domain/macros`, which M2 creates. Write `app/domain/macros.ts` now exactly as in M2 Task 3 Step 3 (M2 then adds its test), so this milestone compiles on its own.

- [ ] **Step 3: Commit after Task 6 (content files are needed for the loader to compile).**

---

### Task 6: Starter content

**Files:**
- Create: `content/plan.json`, `content/foods.json`, `content/exercises.json`, `content/messages.json`, `content/meals/*.json` (25 files)
- Test: `tests/unit/content.test.ts`

Food numbers are USDA FoodData Central per 100 g, SR Legacy unless noted, snapshotted on 2026-10-03. `label` foods have no FDC entry; Kameron should replace the protein powder values with the label of the tub Kameron buys (per 100 g = label per scoop / scoop grams × 100).

- [ ] **Step 1: `content/plan.json`**

```json
{
  "phaseStart": "2026-10-05",
  "weekTypes": { "8": "deload", "12": "maintenance", "13": "checkpoint" },
  "relaxedDays": ["2026-11-26", "2026-12-25"],
  "training": { "1": "mon-chest-back-arms", "3": "wed-legs-shoulders", "5": "fri-chest-shoulders-arms" },
  "optional": { "2": "optional-arms-back", "4": "optional-arms-back" },
  "planB": "plan-b-home",
  "startingTargets": { "kcal": 2400, "proteinG": 180, "stepGoal": 7000 },
  "maintenanceKcal": 2800,
  "slotTimes": { "breakfast": "07:30", "lunch": "14:00", "snack": "15:30", "dinner": "18:30", "dessert": "20:00" },
  "poolRanges": {
    "breakfast": { "kcalMin": 450, "kcalMax": 750, "proteinMin": 40 },
    "main": { "kcalMin": 500, "kcalMax": 800, "proteinMin": 40 },
    "snack": { "kcalMin": 150, "kcalMax": 300, "proteinMin": 15 },
    "dessert": { "kcalMin": 100, "kcalMax": 260, "proteinMin": 0 }
  },
  "templates": {
    "mon-chest-back-arms": {
      "name": "Chest, Back, Arms",
      "kind": "gym",
      "exercises": [
        { "exercise": "incline-dumbbell-press", "repMin": 6, "repMax": 10 },
        { "exercise": "pec-deck", "repMin": 8, "repMax": 12 },
        { "exercise": "lat-pulldown", "repMin": 8, "repMax": 12 },
        { "exercise": "seated-cable-row", "repMin": 8, "repMax": 12 },
        { "exercise": "preacher-curl", "repMin": 8, "repMax": 12 },
        { "exercise": "cable-triceps-pushdown", "repMin": 8, "repMax": 12 }
      ]
    },
    "wed-legs-shoulders": {
      "name": "Legs, Shoulders",
      "kind": "gym",
      "exercises": [
        { "exercise": "leg-press", "repMin": 8, "repMax": 12 },
        { "exercise": "dumbbell-romanian-deadlift", "repMin": 8, "repMax": 10 },
        { "exercise": "lying-leg-curl", "repMin": 10, "repMax": 12 },
        { "exercise": "leg-extension", "repMin": 10, "repMax": 15 },
        { "exercise": "seated-dumbbell-shoulder-press", "repMin": 6, "repMax": 10 },
        { "exercise": "cable-lateral-raise", "repMin": 10, "repMax": 15 }
      ]
    },
    "fri-chest-shoulders-arms": {
      "name": "Chest, Shoulders, Arms",
      "kind": "gym",
      "exercises": [
        { "exercise": "flat-dumbbell-press", "repMin": 6, "repMax": 10 },
        { "exercise": "low-to-high-cable-fly", "repMin": 10, "repMax": 12 },
        { "exercise": "dumbbell-lateral-raise", "repMin": 10, "repMax": 15 },
        { "exercise": "reverse-pec-deck", "repMin": 10, "repMax": 15 },
        { "exercise": "incline-dumbbell-curl", "repMin": 8, "repMax": 12 },
        { "exercise": "overhead-cable-triceps-extension", "repMin": 8, "repMax": 12 }
      ]
    },
    "optional-arms-back": {
      "name": "Arms and Back extra",
      "kind": "optional",
      "exercises": [
        { "exercise": "pull-up", "repMin": 5, "repMax": 12 },
        { "exercise": "cable-lateral-raise", "repMin": 10, "repMax": 15 },
        { "exercise": "hammer-curl", "repMin": 8, "repMax": 12 },
        { "exercise": "rope-pushdown", "repMin": 10, "repMax": 12 }
      ]
    },
    "plan-b-home": {
      "name": "Plan B at home",
      "kind": "plan-b",
      "exercises": [
        { "exercise": "pull-up", "repMin": 5, "repMax": 12 },
        { "exercise": "dip", "repMin": 6, "repMax": 15 },
        { "exercise": "seated-dumbbell-shoulder-press", "repMin": 8, "repMax": 12 },
        { "exercise": "dumbbell-romanian-deadlift", "repMin": 8, "repMax": 12 },
        { "exercise": "dumbbell-curl", "repMin": 8, "repMax": 12 },
        { "exercise": "dumbbell-overhead-triceps-extension", "repMin": 8, "repMax": 12 }
      ]
    }
  }
}
```

- [ ] **Step 2: `content/foods.json`**

```json
[
  { "id": "chicken-breast-raw", "name": "Chicken breast", "fdcId": 171077, "source": "sr-legacy", "state": "raw", "kcalPer100": 120, "proteinPer100": 22.5, "section": "meat-seafood" },
  { "id": "chicken-thigh-raw", "name": "Chicken thighs, boneless skinless", "fdcId": 173627, "source": "sr-legacy", "state": "raw", "kcalPer100": 121, "proteinPer100": 19.7, "section": "meat-seafood" },
  { "id": "sirloin-raw", "name": "Top sirloin, trimmed", "fdcId": 174055, "source": "sr-legacy", "state": "raw", "kcalPer100": 131, "proteinPer100": 22.1, "section": "meat-seafood" },
  { "id": "ground-beef-90-raw", "name": "Ground beef 90/10", "fdcId": 174030, "source": "sr-legacy", "state": "raw", "kcalPer100": 176, "proteinPer100": 20.0, "section": "meat-seafood" },
  { "id": "salmon-raw", "name": "Atlantic salmon", "fdcId": 175167, "source": "sr-legacy", "state": "raw", "kcalPer100": 208, "proteinPer100": 20.4, "section": "meat-seafood" },
  { "id": "cod-raw", "name": "Cod", "fdcId": 171955, "source": "sr-legacy", "state": "raw", "kcalPer100": 82, "proteinPer100": 17.8, "section": "meat-seafood" },
  { "id": "shrimp-raw", "name": "Shrimp, peeled", "fdcId": 175179, "source": "sr-legacy", "state": "raw", "kcalPer100": 85, "proteinPer100": 20.1, "section": "meat-seafood" },
  { "id": "egg-whole", "name": "Eggs", "fdcId": 171287, "source": "sr-legacy", "state": "raw", "kcalPer100": 143, "proteinPer100": 12.6, "section": "dairy-eggs", "eachG": 50, "eachLabel": "egg" },
  { "id": "egg-white", "name": "Egg whites", "fdcId": 172183, "source": "sr-legacy", "state": "raw", "kcalPer100": 52, "proteinPer100": 10.9, "section": "dairy-eggs" },
  { "id": "greek-yogurt-nonfat", "name": "Greek yogurt, plain nonfat", "fdcId": 170894, "source": "sr-legacy", "state": "as-is", "kcalPer100": 59, "proteinPer100": 10.2, "section": "dairy-eggs" },
  { "id": "cottage-cheese-2", "name": "Cottage cheese 2%", "fdcId": 172182, "source": "sr-legacy", "state": "as-is", "kcalPer100": 81, "proteinPer100": 10.4, "section": "dairy-eggs" },
  { "id": "cheddar", "name": "Cheddar", "fdcId": 173414, "source": "sr-legacy", "state": "as-is", "kcalPer100": 403, "proteinPer100": 22.9, "section": "dairy-eggs" },
  { "id": "feta", "name": "Feta", "fdcId": 173420, "source": "sr-legacy", "state": "as-is", "kcalPer100": 265, "proteinPer100": 14.2, "section": "dairy-eggs" },
  { "id": "butter", "name": "Butter", "fdcId": 173410, "source": "sr-legacy", "state": "as-is", "kcalPer100": 717, "proteinPer100": 0.85, "section": "dairy-eggs" },
  { "id": "milk-2", "name": "Milk 2%", "fdcId": 171267, "source": "sr-legacy", "state": "as-is", "kcalPer100": 50, "proteinPer100": 3.3, "section": "dairy-eggs" },
  { "id": "heavy-cream", "name": "Heavy cream", "fdcId": 170859, "source": "sr-legacy", "state": "as-is", "kcalPer100": 340, "proteinPer100": 2.84, "section": "dairy-eggs" },
  { "id": "whey-protein", "name": "Whey protein powder", "fdcId": null, "source": "label", "state": "as-is", "kcalPer100": 400, "proteinPer100": 80, "section": "pantry", "eachG": 30, "eachLabel": "scoop" },
  { "id": "white-rice-cooked", "name": "White rice", "fdcId": 168878, "source": "sr-legacy", "state": "cooked", "kcalPer100": 130, "proteinPer100": 2.69, "section": "pantry" },
  { "id": "potato-russet-raw", "name": "Russet potatoes", "fdcId": 170027, "source": "sr-legacy", "state": "raw", "kcalPer100": 79, "proteinPer100": 2.14, "section": "produce" },
  { "id": "sweet-potato-raw", "name": "Sweet potatoes", "fdcId": 168482, "source": "sr-legacy", "state": "raw", "kcalPer100": 86, "proteinPer100": 1.57, "section": "produce" },
  { "id": "honey", "name": "Honey", "fdcId": 169640, "source": "sr-legacy", "state": "as-is", "kcalPer100": 304, "proteinPer100": 0.3, "section": "pantry" },
  { "id": "banana", "name": "Bananas", "fdcId": 173944, "source": "sr-legacy", "state": "raw", "kcalPer100": 89, "proteinPer100": 1.09, "section": "produce", "eachG": 120, "eachLabel": "banana" },
  { "id": "strawberries", "name": "Strawberries", "fdcId": 167762, "source": "sr-legacy", "state": "raw", "kcalPer100": 32, "proteinPer100": 0.67, "section": "produce" },
  { "id": "blueberries", "name": "Blueberries", "fdcId": 171711, "source": "sr-legacy", "state": "raw", "kcalPer100": 57, "proteinPer100": 0.74, "section": "produce" },
  { "id": "pineapple", "name": "Pineapple", "fdcId": 169124, "source": "sr-legacy", "state": "raw", "kcalPer100": 50, "proteinPer100": 0.54, "section": "produce" },
  { "id": "mango", "name": "Mango", "fdcId": 169910, "source": "sr-legacy", "state": "raw", "kcalPer100": 60, "proteinPer100": 0.82, "section": "produce" },
  { "id": "apple", "name": "Apples", "fdcId": 171688, "source": "sr-legacy", "state": "raw", "kcalPer100": 52, "proteinPer100": 0.26, "section": "produce", "eachG": 180, "eachLabel": "apple" },
  { "id": "avocado", "name": "Avocado", "fdcId": 171705, "source": "sr-legacy", "state": "raw", "kcalPer100": 160, "proteinPer100": 2.0, "section": "produce" },
  { "id": "bell-pepper-red", "name": "Red bell pepper", "fdcId": 170108, "source": "sr-legacy", "state": "raw", "kcalPer100": 26, "proteinPer100": 0.99, "section": "produce" },
  { "id": "onion", "name": "Onion", "fdcId": 170000, "source": "sr-legacy", "state": "raw", "kcalPer100": 40, "proteinPer100": 1.1, "section": "produce" },
  { "id": "lettuce-green-leaf", "name": "Salad greens", "fdcId": 2346391, "source": "foundation", "state": "raw", "kcalPer100": 22, "proteinPer100": 1.09, "section": "produce" },
  { "id": "grape-tomatoes", "name": "Grape tomatoes", "fdcId": 321360, "source": "foundation", "state": "raw", "kcalPer100": 27, "proteinPer100": 0.83, "section": "produce" },
  { "id": "broccoli", "name": "Broccoli", "fdcId": 170379, "source": "sr-legacy", "state": "raw", "kcalPer100": 34, "proteinPer100": 2.82, "section": "produce" },
  { "id": "olive-oil", "name": "Olive oil", "fdcId": 171413, "source": "sr-legacy", "state": "as-is", "kcalPer100": 884, "proteinPer100": 0, "section": "pantry" },
  { "id": "sesame-oil", "name": "Sesame oil", "fdcId": null, "source": "label", "state": "as-is", "kcalPer100": 884, "proteinPer100": 0, "section": "pantry" },
  { "id": "coconut-aminos", "name": "Coconut aminos", "fdcId": null, "source": "label", "state": "as-is", "kcalPer100": 100, "proteinPer100": 0, "section": "pantry" },
  { "id": "salsa", "name": "Salsa", "fdcId": null, "source": "label", "state": "as-is", "kcalPer100": 30, "proteinPer100": 1.5, "section": "pantry" },
  { "id": "cocktail-sauce", "name": "Cocktail sauce", "fdcId": null, "source": "label", "state": "as-is", "kcalPer100": 120, "proteinPer100": 1.5, "section": "pantry" }
]
```

- [ ] **Step 3: `content/exercises.json`** (ids and images verified in `docs/exercises.md`)

```json
[
  { "id": "incline-dumbbell-press", "name": "Incline dumbbell press", "dbId": "Incline_Dumbbell_Press", "group": "chest", "equipment": "dumbbell", "compound": true, "increment": 5 },
  { "id": "pec-deck", "name": "Pec deck", "dbId": "Butterfly", "group": "chest", "equipment": "machine", "compound": false, "increment": 5 },
  { "id": "flat-dumbbell-press", "name": "Flat dumbbell press", "dbId": "Dumbbell_Bench_Press", "group": "chest", "equipment": "dumbbell", "compound": true, "increment": 5 },
  { "id": "low-to-high-cable-fly", "name": "Cable fly, low to high", "dbId": "Low_Cable_Crossover", "group": "chest", "equipment": "cable", "compound": false, "increment": 5 },
  { "id": "cable-crossover", "name": "Cable crossover", "dbId": "Cable_Crossover", "group": "chest", "equipment": "cable", "compound": false, "increment": 5 },
  { "id": "dumbbell-fly", "name": "Dumbbell fly", "dbId": "Dumbbell_Flyes", "group": "chest", "equipment": "dumbbell", "compound": false, "increment": 5 },
  { "id": "machine-chest-press", "name": "Machine chest press", "dbId": "Leverage_Chest_Press", "group": "chest", "equipment": "machine", "compound": true, "increment": 5 },
  { "id": "machine-incline-press", "name": "Machine incline press", "dbId": "Leverage_Incline_Chest_Press", "group": "chest", "equipment": "machine", "compound": true, "increment": 5 },
  { "id": "push-up", "name": "Push-ups", "dbId": "Pushups", "group": "chest", "equipment": "body-weight", "compound": true, "increment": 5 },

  { "id": "lat-pulldown", "name": "Lat pulldown", "dbId": "Wide-Grip_Lat_Pulldown", "group": "back", "equipment": "cable", "compound": true, "increment": 5 },
  { "id": "seated-cable-row", "name": "Seated cable row", "dbId": "Seated_Cable_Rows", "group": "back", "equipment": "cable", "compound": true, "increment": 5 },
  { "id": "pull-up", "name": "Pull-ups", "dbId": "Pullups", "group": "back", "equipment": "body-weight", "compound": true, "increment": 5 },
  { "id": "one-arm-dumbbell-row", "name": "One-arm dumbbell row", "dbId": "One-Arm_Dumbbell_Row", "group": "back", "equipment": "dumbbell", "compound": true, "increment": 5 },
  { "id": "close-grip-lat-pulldown", "name": "Close-grip lat pulldown", "dbId": "Close-Grip_Front_Lat_Pulldown", "group": "back", "equipment": "cable", "compound": true, "increment": 5 },
  { "id": "machine-high-row", "name": "Machine high row", "dbId": "Leverage_High_Row", "group": "back", "equipment": "machine", "compound": true, "increment": 5 },

  { "id": "preacher-curl", "name": "Preacher curl", "dbId": "Preacher_Curl", "group": "biceps", "equipment": "barbell", "compound": false, "increment": 5 },
  { "id": "incline-dumbbell-curl", "name": "Incline dumbbell curl", "dbId": "Incline_Dumbbell_Curl", "group": "biceps", "equipment": "dumbbell", "compound": false, "increment": 5 },
  { "id": "hammer-curl", "name": "Hammer curl", "dbId": "Hammer_Curls", "group": "biceps", "equipment": "dumbbell", "compound": false, "increment": 5 },
  { "id": "dumbbell-curl", "name": "Dumbbell curl", "dbId": "Dumbbell_Bicep_Curl", "group": "biceps", "equipment": "dumbbell", "compound": false, "increment": 5 },
  { "id": "machine-preacher-curl", "name": "Machine preacher curl", "dbId": "Machine_Preacher_Curls", "group": "biceps", "equipment": "machine", "compound": false, "increment": 5 },
  { "id": "cable-rope-hammer-curl", "name": "Cable rope hammer curl", "dbId": "Cable_Hammer_Curls_-_Rope_Attachment", "group": "biceps", "equipment": "cable", "compound": false, "increment": 5 },
  { "id": "alternating-dumbbell-curl", "name": "Alternating dumbbell curl", "dbId": "Dumbbell_Alternate_Bicep_Curl", "group": "biceps", "equipment": "dumbbell", "compound": false, "increment": 5 },

  { "id": "cable-triceps-pushdown", "name": "Cable triceps pushdown", "dbId": "Triceps_Pushdown", "group": "triceps", "equipment": "cable", "compound": false, "increment": 5 },
  { "id": "overhead-cable-triceps-extension", "name": "Overhead cable triceps extension", "dbId": "Cable_Rope_Overhead_Triceps_Extension", "group": "triceps", "equipment": "cable", "compound": false, "increment": 5 },
  { "id": "rope-pushdown", "name": "Rope pushdown", "dbId": "Triceps_Pushdown_-_Rope_Attachment", "group": "triceps", "equipment": "cable", "compound": false, "increment": 5 },
  { "id": "dip", "name": "Dips", "dbId": "Dips_-_Triceps_Version", "group": "triceps", "equipment": "body-weight", "compound": true, "increment": 5 },
  { "id": "dumbbell-overhead-triceps-extension", "name": "Dumbbell overhead triceps extension", "dbId": "Standing_Dumbbell_Triceps_Extension", "group": "triceps", "equipment": "dumbbell", "compound": false, "increment": 5 },
  { "id": "cable-lying-triceps-extension", "name": "Cable lying triceps extension", "dbId": "Cable_Lying_Triceps_Extension", "group": "triceps", "equipment": "cable", "compound": false, "increment": 5 },
  { "id": "machine-triceps-extension", "name": "Machine triceps extension", "dbId": "Machine_Triceps_Extension", "group": "triceps", "equipment": "machine", "compound": false, "increment": 5 },

  { "id": "leg-press", "name": "Leg press", "dbId": "Leg_Press", "group": "quads", "equipment": "machine", "compound": true, "increment": 10 },
  { "id": "leg-extension", "name": "Leg extension", "dbId": "Leg_Extensions", "group": "quads", "equipment": "machine", "compound": false, "increment": 10 },
  { "id": "narrow-stance-leg-press", "name": "Narrow-stance leg press", "dbId": "Narrow_Stance_Leg_Press", "group": "quads", "equipment": "machine", "compound": true, "increment": 10 },
  { "id": "single-leg-extension", "name": "Single-leg extension", "dbId": "Single-Leg_Leg_Extension", "group": "quads", "equipment": "machine", "compound": false, "increment": 10 },

  { "id": "dumbbell-romanian-deadlift", "name": "Dumbbell Romanian deadlift", "dbId": "Stiff-Legged_Dumbbell_Deadlift", "group": "hamstrings", "equipment": "dumbbell", "compound": true, "increment": 10 },
  { "id": "lying-leg-curl", "name": "Lying leg curl", "dbId": "Lying_Leg_Curls", "group": "hamstrings", "equipment": "machine", "compound": false, "increment": 10 },
  { "id": "seated-leg-curl", "name": "Seated leg curl", "dbId": "Seated_Leg_Curl", "group": "hamstrings", "equipment": "machine", "compound": false, "increment": 10 },
  { "id": "barbell-romanian-deadlift", "name": "Barbell Romanian deadlift", "dbId": "Romanian_Deadlift", "group": "hamstrings", "equipment": "barbell", "compound": true, "increment": 10 },

  { "id": "seated-dumbbell-shoulder-press", "name": "Seated dumbbell shoulder press", "dbId": "Dumbbell_Shoulder_Press", "group": "shoulder-press", "equipment": "dumbbell", "compound": true, "increment": 5 },
  { "id": "machine-shoulder-press", "name": "Machine shoulder press", "dbId": "Leverage_Shoulder_Press", "group": "shoulder-press", "equipment": "machine", "compound": true, "increment": 5 },
  { "id": "arnold-press", "name": "Arnold press", "dbId": "Arnold_Dumbbell_Press", "group": "shoulder-press", "equipment": "dumbbell", "compound": true, "increment": 5 },

  { "id": "cable-lateral-raise", "name": "Cable lateral raise", "dbId": "Standing_Low-Pulley_Deltoid_Raise", "group": "side-delts", "equipment": "cable", "compound": false, "increment": 5 },
  { "id": "dumbbell-lateral-raise", "name": "Dumbbell lateral raise", "dbId": "Side_Lateral_Raise", "group": "side-delts", "equipment": "dumbbell", "compound": false, "increment": 5 },
  { "id": "seated-lateral-raise", "name": "Seated lateral raise", "dbId": "Seated_Side_Lateral_Raise", "group": "side-delts", "equipment": "dumbbell", "compound": false, "increment": 5 },

  { "id": "reverse-pec-deck", "name": "Reverse pec deck", "dbId": "Reverse_Machine_Flyes", "group": "rear-delts", "equipment": "machine", "compound": false, "increment": 5 },
  { "id": "dumbbell-reverse-fly", "name": "Dumbbell reverse fly", "dbId": "Reverse_Flyes", "group": "rear-delts", "equipment": "dumbbell", "compound": false, "increment": 5 },
  { "id": "face-pull", "name": "Face pull", "dbId": "Face_Pull", "group": "rear-delts", "equipment": "cable", "compound": false, "increment": 5 }
]
```

- [ ] **Step 4: `content/messages.json`** (variables: `protein`, `lunch`, `workout`, `left`, `streak`, `nextMeal`)

```json
{
  "relaxed-day": [
    "Holiday. Enjoy it. Back on it tomorrow.",
    "Relaxed day. Eat, enjoy, no guilt. The plan picks up tomorrow.",
    "Day off from the numbers. Tomorrow we go again."
  ],
  "missed-twice": [
    "Two training days missed. That's the pattern we said we'd catch. Plan B is 25 minutes. Do it tonight.",
    "Two misses in a row. Not a disaster, but a third is how it slips. Plan B tonight.",
    "We said never miss twice. That happened. Fix it with Plan B before bed."
  ],
  "missed-today": [
    "No lift yet today. Plan B at home still counts. Get it done.",
    "Gym didn't happen? 25 minutes with the dumbbells tonight keeps it honest.",
    "Session's still open. Gym or Plan B, your call. Just not zero."
  ],
  "weigh-in-missing": [
    "Step on the scale first. One number, five seconds.",
    "Weigh-in before anything else. The trend needs today's number.",
    "Scale first, then breakfast."
  ],
  "training-day-morning": [
    "Breakfast is in, {protein} g protein down. Lift at noon, then {lunch} right after.",
    "Training day. {workout} at noon. Eat, show up, beat last week.",
    "Lift today: {workout}. Last time's numbers are waiting to be beaten."
  ],
  "protein-behind": [
    "{left} g protein to go. The snack and dinner cover it if you eat both.",
    "Protein's behind: {left} g left. Don't skip dinner.",
    "{left} g of protein still on the table. Hit it before the kitchen closes."
  ],
  "steps-behind": [
    "{left} steps left. Two 15-minute walks and you're there.",
    "{left} steps to go. Walk after dinner.",
    "Steps are short by {left}. Short walks add up, keep each under 30 minutes for your feet."
  ],
  "kitchen-closed": [
    "Dessert's done. Kitchen's closed. See you at breakfast.",
    "Kitchen's closed. Bored isn't hungry. Water and bed.",
    "Done eating for today. Good work."
  ],
  "on-plan": [
    "On plan today. {streak} days straight. Keep stacking them.",
    "Today counts. {streak} in a row.",
    "{streak}-day streak. This is what the new normal looks like."
  ],
  "default": [
    "One meal at a time. Next up: {nextMeal}.",
    "Next up: {nextMeal}. Stick to the plan and the day takes care of itself.",
    "Keep it simple. {nextMeal} is next."
  ]
}
```

- [ ] **Step 5: The 25 meal files** (one file per block; file name is `content/meals/<slug>.json`)

`content/meals/steak-and-eggs.json`
```json
{ "slug": "steak-and-eggs", "name": "Steak and eggs", "pool": "breakfast", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [
    { "food": "sirloin-raw", "grams": 150 }, { "food": "egg-whole", "grams": 100, "note": "2 eggs" },
    { "food": "egg-white", "grams": 100 }, { "food": "butter", "grams": 5 }, { "food": "banana", "grams": 120, "note": "1 banana, on the side" } ],
  "steps": ["Pat the steak dry, salt and pepper both sides.", "Sear in a hot pan 3 to 4 minutes a side for medium. Rest 5 minutes.", "Scramble the eggs and whites in the butter over medium-low heat.", "Slice the steak and serve with the eggs and banana."] }
```

`content/meals/greek-yogurt-power-bowl.json`
```json
{ "slug": "greek-yogurt-power-bowl", "name": "Greek yogurt power bowl", "pool": "breakfast", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [
    { "food": "greek-yogurt-nonfat", "grams": 350 }, { "food": "whey-protein", "grams": 30, "note": "1 scoop" },
    { "food": "blueberries", "grams": 75 }, { "food": "strawberries", "grams": 75 }, { "food": "banana", "grams": 100 }, { "food": "honey", "grams": 20 } ],
  "steps": ["Stir the protein powder into the yogurt until smooth.", "Slice the banana and strawberries.", "Top with the fruit and drizzle the honey."] }
```

`content/meals/egg-and-potato-hash.json`
```json
{ "slug": "egg-and-potato-hash", "name": "Loaded egg and potato hash", "pool": "breakfast", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [
    { "food": "potato-russet-raw", "grams": 200, "note": "diced small" }, { "food": "butter", "grams": 5 },
    { "food": "egg-whole", "grams": 150, "note": "3 eggs" }, { "food": "egg-white", "grams": 250 }, { "food": "cheddar", "grams": 30 } ],
  "steps": ["Microwave the diced potato 3 minutes to par-cook.", "Crisp the potato in the butter in a nonstick pan, 6 to 8 minutes. Salt and pepper.", "Pour in the eggs and whites, stir gently until just set.", "Top with the cheddar and cover 1 minute to melt."] }
```

`content/meals/banana-protein-pancakes.json`
```json
{ "slug": "banana-protein-pancakes", "name": "Banana protein pancakes", "pool": "breakfast", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [
    { "food": "egg-whole", "grams": 150, "note": "3 eggs" }, { "food": "banana", "grams": 120, "note": "1 ripe banana" },
    { "food": "whey-protein", "grams": 30, "note": "1 scoop" }, { "food": "greek-yogurt-nonfat", "grams": 150, "note": "on top" }, { "food": "honey", "grams": 15 } ],
  "steps": ["Mash the banana, whisk in the eggs and protein powder.", "Cook small pancakes on a nonstick pan over medium heat, about 2 minutes a side.", "Top with the yogurt and honey."] }
```

`content/meals/chicken-and-rice-bowl.json`
```json
{ "slug": "chicken-and-rice-bowl", "name": "Chicken and rice bowl", "pool": "main", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [
    { "food": "chicken-breast-raw", "grams": 220 }, { "food": "white-rice-cooked", "grams": 200 },
    { "food": "butter", "grams": 10 }, { "food": "pineapple", "grams": 100, "note": "on the side" } ],
  "steps": ["Season the chicken with salt, pepper, and garlic powder.", "Cook in a hot pan, 6 to 7 minutes a side, until it hits 165°F.", "Slice and serve over the rice with the butter.", "Pineapple on the side."] }
```

`content/meals/steak-and-baked-potato.json`
```json
{ "slug": "steak-and-baked-potato", "name": "Steak and baked potato", "pool": "main", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [
    { "food": "sirloin-raw", "grams": 200 }, { "food": "potato-russet-raw", "grams": 300 },
    { "food": "butter", "grams": 10 }, { "food": "greek-yogurt-nonfat", "grams": 100, "note": "as sour cream" } ],
  "steps": ["Prick the potato and microwave 8 to 10 minutes until soft, turning once.", "Salt and pepper the steak, sear 3 to 4 minutes a side, rest 5 minutes.", "Split the potato, add the butter and yogurt.", "Slice the steak and serve."] }
```

`content/meals/garlic-butter-shrimp-and-rice.json`
```json
{ "slug": "garlic-butter-shrimp-and-rice", "name": "Garlic butter shrimp and rice", "pool": "main", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [
    { "food": "shrimp-raw", "grams": 250 }, { "food": "butter", "grams": 15 },
    { "food": "white-rice-cooked", "grams": 200 }, { "food": "mango", "grams": 100, "note": "on the side" } ],
  "steps": ["Pat the shrimp dry, season with salt and pepper.", "Melt the butter with minced garlic over medium heat.", "Cook the shrimp 1 to 2 minutes a side until pink.", "Serve over the rice with the mango on the side."] }
```

`content/meals/lemon-butter-cod-and-potatoes.json`
```json
{ "slug": "lemon-butter-cod-and-potatoes", "name": "Lemon butter cod and potatoes", "pool": "main", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [
    { "food": "cod-raw", "grams": 300 }, { "food": "potato-russet-raw", "grams": 300, "note": "cut in wedges" }, { "food": "butter", "grams": 15 } ],
  "steps": ["Roast the potato wedges at 425°F for 30 minutes, salted.", "Season the cod with salt, pepper, and lemon zest.", "Pan-sear the cod in the butter 3 to 4 minutes a side until it flakes.", "Squeeze lemon over the top and serve with the potatoes."] }
```

`content/meals/honey-glazed-chicken-thighs.json`
```json
{ "slug": "honey-glazed-chicken-thighs", "name": "Honey-glazed chicken thighs", "pool": "main", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [
    { "food": "chicken-thigh-raw", "grams": 250 }, { "food": "honey", "grams": 15 }, { "food": "white-rice-cooked", "grams": 200 } ],
  "steps": ["Season the thighs with salt, pepper, and paprika.", "Cook in a hot pan 5 to 6 minutes a side until 175°F.", "Brush with the honey in the last minute and let it caramelize.", "Serve over the rice."] }
```

`content/meals/steak-and-egg-rice-bowl.json`
```json
{ "slug": "steak-and-egg-rice-bowl", "name": "Steak and egg rice bowl", "pool": "main", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [
    { "food": "sirloin-raw", "grams": 180 }, { "food": "white-rice-cooked", "grams": 180 }, { "food": "egg-whole", "grams": 100, "note": "2 eggs" } ],
  "steps": ["Sear the seasoned steak 3 to 4 minutes a side, rest, then slice thin.", "Fry the eggs sunny side up.", "Build the bowl: rice, steak, eggs on top."] }
```

`content/meals/salmon-and-rice.json`
```json
{ "slug": "salmon-and-rice", "name": "Salmon and rice", "pool": "main", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [ { "food": "salmon-raw", "grams": 200 }, { "food": "white-rice-cooked", "grams": 150 } ],
  "steps": ["Season the salmon with salt, pepper, and lemon.", "Roast skin-side down at 400°F for 12 to 14 minutes.", "Serve over the rice. Lower protein than most mains, so pick a higher-protein snack today."] }
```

`content/meals/burger-bowl.json`
```json
{ "slug": "burger-bowl", "name": "Burger bowl", "pool": "main", "mode": "any", "tags": ["ground-beef"], "source": "starter",
  "ingredients": [
    { "food": "ground-beef-90-raw", "grams": 200 }, { "food": "potato-russet-raw", "grams": 250, "note": "cubed" }, { "food": "cheddar", "grams": 30 } ],
  "steps": ["Roast or air-fry the potato cubes at 425°F for 25 minutes.", "Brown the beef with salt, pepper, and garlic powder, breaking it up.", "Pile the beef on the potatoes and top with the cheddar."] }
```

`content/meals/chicken-fajita-bowl.json`
```json
{ "slug": "chicken-fajita-bowl", "name": "Chicken fajita bowl", "pool": "main", "mode": "weekend", "tags": [], "source": "starter",
  "ingredients": [
    { "food": "chicken-breast-raw", "grams": 220, "note": "sliced in strips" }, { "food": "bell-pepper-red", "grams": 100 },
    { "food": "onion", "grams": 50 }, { "food": "white-rice-cooked", "grams": 150 }, { "food": "avocado", "grams": 50 }, { "food": "salsa", "grams": 40 } ],
  "steps": ["Toss the chicken with chili powder, cumin, salt, and lime.", "Sear the chicken in a hot pan until cooked, then the peppers and onion until charred.", "Build the bowl over rice, top with avocado and salsa."] }
```

`content/meals/steak-salad.json`
```json
{ "slug": "steak-salad", "name": "Steak salad", "pool": "main", "mode": "weekend", "tags": [], "source": "starter",
  "ingredients": [
    { "food": "sirloin-raw", "grams": 200 }, { "food": "lettuce-green-leaf", "grams": 100 }, { "food": "grape-tomatoes", "grams": 100 },
    { "food": "feta", "grams": 30 }, { "food": "olive-oil", "grams": 10 }, { "food": "potato-russet-raw", "grams": 100, "note": "roasted, cubed" } ],
  "steps": ["Roast the potato cubes at 425°F for 25 minutes.", "Sear the steak 3 to 4 minutes a side, rest, slice.", "Toss the greens and tomatoes with the olive oil, salt, and a squeeze of lemon.", "Top with the steak, potatoes, and feta."] }
```

`content/meals/shrimp-stir-fry.json`
```json
{ "slug": "shrimp-stir-fry", "name": "Shrimp stir-fry", "pool": "main", "mode": "weekend", "tags": [], "source": "starter",
  "ingredients": [
    { "food": "shrimp-raw", "grams": 250 }, { "food": "broccoli", "grams": 120 }, { "food": "bell-pepper-red", "grams": 80 },
    { "food": "sesame-oil", "grams": 10 }, { "food": "coconut-aminos", "grams": 15 }, { "food": "white-rice-cooked", "grams": 150 } ],
  "steps": ["Heat the sesame oil in a wok or large pan over high heat.", "Stir-fry the broccoli and pepper 3 minutes.", "Add the shrimp and cook 2 to 3 minutes until pink.", "Toss with the coconut aminos and serve over the rice."] }
```

`content/meals/greek-yogurt-and-berries.json`
```json
{ "slug": "greek-yogurt-and-berries", "name": "Greek yogurt and berries", "pool": "snack", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [ { "food": "greek-yogurt-nonfat", "grams": 250 }, { "food": "blueberries", "grams": 50 }, { "food": "honey", "grams": 10 } ],
  "steps": ["Top the yogurt with the berries and honey."] }
```

`content/meals/cottage-cheese-and-pineapple.json`
```json
{ "slug": "cottage-cheese-and-pineapple", "name": "Cottage cheese and pineapple", "pool": "snack", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [ { "food": "cottage-cheese-2", "grams": 200 }, { "food": "pineapple", "grams": 100 } ],
  "steps": ["Spoon the cottage cheese into a bowl and top with the pineapple."] }
```

`content/meals/protein-shake.json`
```json
{ "slug": "protein-shake", "name": "Protein shake", "pool": "snack", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [ { "food": "whey-protein", "grams": 30, "note": "1 scoop" }, { "food": "milk-2", "grams": 300 } ],
  "steps": ["Shake or blend the protein powder with the milk and a few ice cubes."] }
```

`content/meals/shrimp-cocktail.json`
```json
{ "slug": "shrimp-cocktail", "name": "Shrimp cocktail", "pool": "snack", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [ { "food": "shrimp-raw", "grams": 180 }, { "food": "cocktail-sauce", "grams": 30 } ],
  "steps": ["Boil the shrimp 2 minutes until pink, then plunge into ice water.", "Serve cold with the cocktail sauce and a lemon wedge."] }
```

`content/meals/hard-boiled-eggs-and-fruit.json`
```json
{ "slug": "hard-boiled-eggs-and-fruit", "name": "Hard-boiled eggs and fruit", "pool": "snack", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [ { "food": "egg-whole", "grams": 150, "note": "3 eggs" }, { "food": "apple", "grams": 150 } ],
  "steps": ["Boil the eggs 10 minutes, cool in ice water, peel.", "Slice the apple and eat together."] }
```

`content/meals/protein-ice-cream.json`
```json
{ "slug": "protein-ice-cream", "name": "Protein \"ice cream\"", "pool": "dessert", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [ { "food": "whey-protein", "grams": 30, "note": "1 scoop" }, { "food": "strawberries", "grams": 150, "note": "frozen" }, { "food": "milk-2", "grams": 100 } ],
  "steps": ["Blend the frozen strawberries, protein powder, and milk until thick, scraping down the sides.", "Eat right away with a spoon, or freeze 20 minutes for firmer."] }
```

`content/meals/greek-yogurt-honey-berries.json`
```json
{ "slug": "greek-yogurt-honey-berries", "name": "Greek yogurt, honey, berries", "pool": "dessert", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [ { "food": "greek-yogurt-nonfat", "grams": 170 }, { "food": "blueberries", "grams": 75 }, { "food": "honey", "grams": 10 } ],
  "steps": ["Top the yogurt with the berries and drizzle the honey."] }
```

`content/meals/banana-nice-cream.json`
```json
{ "slug": "banana-nice-cream", "name": "Banana \"nice cream\"", "pool": "dessert", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [ { "food": "banana", "grams": 120, "note": "frozen in slices" }, { "food": "milk-2", "grams": 100 }, { "food": "honey", "grams": 10 } ],
  "steps": ["Blend the frozen banana with the milk and honey until it looks like soft serve."] }
```

`content/meals/strawberries-and-whipped-cream.json`
```json
{ "slug": "strawberries-and-whipped-cream", "name": "Strawberries and whipped cream", "pool": "dessert", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [ { "food": "strawberries", "grams": 150 }, { "food": "heavy-cream", "grams": 40 } ],
  "steps": ["Whip the cream to soft peaks.", "Spoon over the sliced strawberries."] }
```

`content/meals/baked-cinnamon-apple.json`
```json
{ "slug": "baked-cinnamon-apple", "name": "Baked cinnamon apple", "pool": "dessert", "mode": "any", "tags": [], "source": "starter",
  "ingredients": [ { "food": "apple", "grams": 180, "note": "1 apple, cored and sliced" }, { "food": "honey", "grams": 10 }, { "food": "greek-yogurt-nonfat", "grams": 100, "note": "on top" } ],
  "steps": ["Toss the apple slices with cinnamon and the honey.", "Microwave 3 minutes or bake at 375°F for 20 minutes until soft.", "Top with the yogurt."] }
```

- [ ] **Step 6: Write the content test**

```ts
// tests/unit/content.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exercises, foods, meals, messages, plan } from "~/content";

const exercisesDoc = readFileSync(path.join(import.meta.dirname, "../../docs/exercises.md"), "utf8");

describe("content", () => {
  it("loads the starter library", () => {
    expect(meals.size).toBe(25);
    expect(foods.size).toBeGreaterThanOrEqual(38);
    expect(exercises.size).toBe(46);
  });

  it("references only known foods", () => {
    for (const meal of meals.values()) {
      for (const ing of meal.ingredients) expect(foods.has(ing.food), `${meal.slug} uses ${ing.food}`).toBe(true);
    }
  });

  it("keeps every meal inside its pool's calorie and protein range", () => {
    for (const meal of meals.values()) {
      const r = plan.poolRanges[meal.pool]!;
      expect(meal.kcal, `${meal.slug} kcal`).toBeGreaterThanOrEqual(r.kcalMin);
      expect(meal.kcal, `${meal.slug} kcal`).toBeLessThanOrEqual(r.kcalMax);
      expect(meal.protein, `${meal.slug} protein`).toBeGreaterThanOrEqual(r.proteinMin);
    }
  });

  it("uses url-safe slugs", () => {
    for (const meal of meals.values()) expect(meal.slug).toMatch(/^[a-z0-9-]+$/);
  });

  it("tags every ground beef meal", () => {
    for (const meal of meals.values()) {
      if (meal.ingredients.some((i) => i.food.startsWith("ground-beef"))) expect(meal.tags).toContain("ground-beef");
    }
  });

  it("has enough meals in every pool for the rotation", () => {
    const count = (pool: string) => [...meals.values()].filter((m) => m.pool === pool && m.mode === "any").length;
    expect(count("breakfast")).toBeGreaterThanOrEqual(4);
    expect(count("main")).toBeGreaterThanOrEqual(7);
    expect(count("snack")).toBeGreaterThanOrEqual(4);
    expect(count("dessert")).toBeGreaterThanOrEqual(4);
  });

  it("uses only known exercises in templates and every template weekday points at a template", () => {
    for (const [id, t] of Object.entries(plan.templates)) {
      for (const e of t.exercises) expect(exercises.has(e.exercise), `${id} uses ${e.exercise}`).toBe(true);
    }
    for (const id of [...Object.values(plan.training), ...Object.values(plan.optional), plan.planB]) {
      expect(plan.templates[id], id).toBeDefined();
    }
  });

  it("only uses exercise images that were checked by eye", () => {
    for (const ex of exercises.values()) expect(exercisesDoc, ex.dbId).toContain("`" + ex.dbId + "`");
  });

  it("has copy for every Rocky situation", () => {
    for (const key of ["relaxed-day", "missed-twice", "missed-today", "weigh-in-missing", "training-day-morning", "protein-behind", "steps-behind", "kitchen-closed", "on-plan", "default"]) {
      expect(messages[key]?.length, key).toBeGreaterThanOrEqual(3);
    }
  });
});
```

The `docs/exercises.md` table lists `Pushups` under Plan B and every other id in the two tables, so the image check passes for all 46 exercises.

- [ ] **Step 7: Run it**

Run: `npx vitest run --project unit tests/unit/content.test.ts`
Expected: PASS (9 tests). The macro numbers were precomputed on 2026-10-03: every meal is inside its range (lowest margin: hard-boiled eggs and fruit at 290 kcal against a 300 max, and salmon and rice at 45 g protein).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add starter content and content validation"
```

---

### Task 7: Auth

**Files:**
- Create: `app/server/session.server.ts`, `app/server/auth.server.ts`, `app/routes/login.tsx`, `app/routes/logout.tsx`
- Modify: `app/root.tsx` (middleware), `app/routes.ts`
- Test: `tests/workers/auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/workers/auth.test.ts
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { requireSignedIn } from "~/server/auth.server";
import { action as loginAction } from "~/routes/login";

const args = (request: Request) => ({ request, params: {}, context: {} }) as any;

function loginRequest(password: string, ip = "203.0.113.7") {
  const body = new FormData();
  body.set("password", password);
  return new Request("http://localhost/login", { method: "POST", body, headers: { "CF-Connecting-IP": ip } });
}

async function thrown(p: Promise<unknown>) {
  try {
    await p;
    return null;
  } catch (e) {
    return e as Response;
  }
}

describe("auth", () => {
  it("redirects signed-out requests to /login", async () => {
    const res = await thrown(requireSignedIn(new Request("http://localhost/plan")));
    expect(res?.status).toBe(302);
    expect(res?.headers.get("Location")).toBe("/login");
  });

  it("lets public paths through", async () => {
    expect(await thrown(requireSignedIn(new Request("http://localhost/login")))).toBeNull();
    expect(await thrown(requireSignedIn(new Request("http://localhost/login.data")))).toBeNull();
    expect(await thrown(requireSignedIn(new Request("http://localhost/api/ingest/steps", { method: "POST" })))).toBeNull();
  });

  it("rejects a wrong password", async () => {
    const res = await loginAction(args(loginRequest("nope")));
    expect((res as any).init?.status ?? (res as Response).status).toBe(401);
  });

  it("signs in with the right password and the cookie passes the guard", async () => {
    const res = (await loginAction(args(loginRequest("test-password", "198.51.100.1")))) as Response;
    expect(res.status).toBe(302);
    const setCookie = res.headers.get("Set-Cookie")!;
    expect(setCookie).toMatch(/Max-Age=34560000/);
    const cookie = setCookie.split(";")[0];
    expect(await thrown(requireSignedIn(new Request("http://localhost/plan", { headers: { Cookie: cookie } })))).toBeNull();
  });

  it("locks out an IP after 5 failed attempts in 15 minutes", async () => {
    for (let i = 0; i < 5; i++) await loginAction(args(loginRequest("wrong", "192.0.2.50")));
    const res = await loginAction(args(loginRequest("test-password", "192.0.2.50")));
    expect((res as any).init?.status ?? (res as Response).status).toBe(429);
    const { results } = await env.DB.prepare("select count(*) as n from login_attempts where ip = ?").bind("192.0.2.50").all<{ n: number }>();
    expect(results[0].n).toBe(5);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run --project workers tests/workers/auth.test.ts`
Expected: FAIL, cannot resolve `~/server/auth.server`.

- [ ] **Step 3: Session storage**

```ts
// app/server/session.server.ts
import { env } from "cloudflare:workers";
import { createCookieSessionStorage } from "react-router";

type SessionData = { signedIn: true };

export const sessionStorage = createCookieSessionStorage<SessionData>({
  cookie: {
    name: "__rocky",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [env.SESSION_SECRET],
    secure: import.meta.env.PROD,
    maxAge: 60 * 60 * 24 * 400,
  },
});

export const { getSession, commitSession, destroySession } = sessionStorage;
```

- [ ] **Step 4: Auth helpers**

```ts
// app/server/auth.server.ts
import { env } from "cloudflare:workers";
import { and, eq, gte } from "drizzle-orm";
import { redirect } from "react-router";
import { getDb } from "~/db/client";
import { loginAttempts } from "~/db/schema";
import { getSession } from "./session.server";

const PUBLIC_PATHS = [/^\/login$/, /^\/api\/ingest\//];

export async function requireSignedIn(request: Request): Promise<void> {
  const pathname = new URL(request.url).pathname.replace(/\.data$/, "");
  if (PUBLIC_PATHS.some((re) => re.test(pathname))) return;
  const session = await getSession(request.headers.get("Cookie"));
  if (!session.get("signedIn")) throw redirect("/login");
}

export async function passwordMatches(candidate: string): Promise<boolean> {
  const enc = new TextEncoder();
  const a = enc.encode(candidate);
  const b = enc.encode(env.APP_PASSWORD);
  if (a.byteLength !== b.byteLength) {
    crypto.subtle.timingSafeEqual(b, b);
    return false;
  }
  return crypto.subtle.timingSafeEqual(a, b);
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export async function isLockedOut(ip: string, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  const rows = await getDb(env.DB)
    .select({ id: loginAttempts.id })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), gte(loginAttempts.attemptedAt, since)))
    .all();
  return rows.length >= MAX_FAILURES;
}

export async function recordFailure(ip: string, now = new Date()): Promise<void> {
  await getDb(env.DB).insert(loginAttempts).values({ ip, attemptedAt: now.toISOString() });
}

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}
```

- [ ] **Step 5: Login and logout routes**

```tsx
// app/routes/login.tsx
import { data, Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { clientIp, isLockedOut, passwordMatches, recordFailure } from "~/server/auth.server";
import { commitSession, getSession } from "~/server/session.server";

export function meta() {
  return [{ title: "Sign in · Rocky" }];
}

export async function action({ request }: Route.ActionArgs) {
  const ip = clientIp(request);
  if (await isLockedOut(ip)) {
    return data({ error: "Too many tries. Wait 15 minutes." }, { status: 429 });
  }
  const form = await request.formData();
  if (!(await passwordMatches(String(form.get("password") ?? "")))) {
    await recordFailure(ip);
    return data({ error: "Wrong password." }, { status: 401 });
  }
  const session = await getSession(request.headers.get("Cookie"));
  session.set("signedIn", true);
  return redirect("/", { headers: { "Set-Cookie": await commitSession(session) } });
}

export default function Login({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-[34px] font-bold">Rocky</h1>
      <p className="mt-1 text-label-2">Your plan, every day.</p>
      <Form method="post" className="mt-8 flex flex-col gap-3">
        <label htmlFor="password" className="text-[13px] font-semibold text-label-2">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-[52px] rounded-[14px] bg-fill px-4 text-[17px] outline-none"
        />
        {actionData?.error && <p className="text-[15px] text-calories">{actionData.error}</p>}
        <button type="submit" disabled={busy} className="btn-prominent mt-2 h-[54px] rounded-full text-[17px] font-semibold">
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </Form>
    </main>
  );
}
```

```ts
// app/routes/logout.tsx
import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { destroySession, getSession } from "~/server/session.server";

export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  return redirect("/login", { headers: { "Set-Cookie": await destroySession(session) } });
}
```

- [ ] **Step 6: Guard every request with root middleware**

Add to `app/root.tsx` (below the imports):

```tsx
import { requireSignedIn } from "~/server/auth.server";

export const middleware: Route.MiddlewareFunction[] = [
  async ({ request }, next) => {
    await requireSignedIn(request);
    return next();
  },
];
```

- [ ] **Step 7: Run the test**

Run: `npx vitest run --project workers tests/workers/auth.test.ts`
Expected: PASS (5 tests). If the `data()` return shape differs from `{ init: { status } }`, the `?? (res as Response).status` fallback covers a `Response`.

- [ ] **Step 8: Commit** (routes are registered in Task 8)

```bash
git add -A
git commit -m "Add password auth, rate limiting, and route guard"
```

---

### Task 8: Tab layout and placeholder screens

**Files:**
- Create: `app/components/ui.tsx`, `app/components/TabBar.tsx`, `app/routes/app-layout.tsx`, `app/routes/today.tsx`, `app/routes/plan.tsx`, `app/routes/progress.tsx`, `app/routes/library.tsx`, `app/routes/settings.tsx`
- Modify: `app/routes.ts`
- Delete: `app/routes/home.tsx`

- [ ] **Step 1: Shared UI primitives**

```tsx
// app/components/ui.tsx
import type { ReactNode } from "react";
import { Link } from "react-router";

export function Screen({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex w-full max-w-[760px] flex-col gap-[18px] px-4 pb-32 pt-[54px] min-[900px]:pb-12">{children}</main>;
}

export function LargeTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <header className="flex items-end justify-between px-1">
      <div>
        {eyebrow && <div className="text-[15px] font-semibold text-label-2">{eyebrow}</div>}
        <h1 className="mt-0.5 text-[34px] font-bold">{title}</h1>
      </div>
      {right}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[26px] bg-card ${className}`}>{children}</section>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between px-1 pt-1.5">
      <h2 className="text-[22px] font-bold">{children}</h2>
      {right && <div className="text-[15px] text-label-2">{right}</div>}
    </div>
  );
}

export function BackButton({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} aria-label={label} className="glass flex size-11 items-center justify-center rounded-full">
      <Icon name="back" />
    </Link>
  );
}

const PATHS: Record<string, ReactNode> = {
  today: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  plan: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  progress: (
    <>
      <path d="M3 17l5-5 4 3 8-8" />
      <path d="M15 7h5v5" />
    </>
  ),
  library: (
    <>
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M5 17a3 3 0 0 1 3-3h11" />
    </>
  ),
  back: <path d="M15 6l-6 6 6 6" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  swap: <path d="M7 7h12l-3-3M17 17H5l3 3" />,
  plate: (
    <>
      <circle cx="12" cy="13" r="7" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
};

export function Icon({ name, size = 20, strokeWidth = 2.2 }: { name: keyof typeof PATHS | string; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
```

- [ ] **Step 2: Tab bar** (floating glass capsule on phones, glass sidebar at 900 px and up)

```tsx
// app/components/TabBar.tsx
import { NavLink } from "react-router";
import { Icon } from "./ui";

const TABS = [
  { to: "/", label: "Today", icon: "today" },
  { to: "/plan", label: "Plan", icon: "plan" },
  { to: "/progress", label: "Progress", icon: "progress" },
  { to: "/library", label: "Library", icon: "library" },
] as const;

export function TabBar() {
  return (
    <nav
      aria-label="Main"
      className="glass-bar fixed inset-x-5 bottom-[max(28px,env(safe-area-inset-bottom))] z-20 grid h-16 grid-cols-4 gap-0.5 rounded-full p-1.5
        min-[900px]:inset-x-auto min-[900px]:bottom-auto min-[900px]:left-6 min-[900px]:top-6 min-[900px]:h-auto min-[900px]:w-52 min-[900px]:grid-cols-1 min-[900px]:rounded-[26px] min-[900px]:p-2"
    >
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === "/"}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold min-[900px]:h-12 min-[900px]:flex-row min-[900px]:justify-start min-[900px]:gap-3 min-[900px]:rounded-2xl min-[900px]:px-4 min-[900px]:text-[15px] ${
              isActive ? "bg-[var(--glass-selected)] text-label" : "text-label-2"
            }`
          }
        >
          <Icon name={t.icon} size={22} strokeWidth={2} />
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: Layout route** (hides the tab bar on pushed screens via route `handle`)

```tsx
// app/routes/app-layout.tsx
import { Outlet, useMatches } from "react-router";
import { TabBar } from "~/components/TabBar";

export default function AppLayout() {
  const hideTabBar = useMatches().some((m) => (m.handle as { hideTabBar?: boolean } | undefined)?.hideTabBar);
  return (
    <div className={hideTabBar ? "" : "min-[900px]:pl-60"}>
      <Outlet />
      {!hideTabBar && <TabBar />}
    </div>
  );
}
```

- [ ] **Step 4: Placeholder screens** (each is replaced in a later milestone)

```tsx
// app/routes/today.tsx
import { Link } from "react-router";
import { Icon, LargeTitle, Screen } from "~/components/ui";

export default function Today() {
  return (
    <Screen>
      <LargeTitle
        eyebrow="Rocky"
        title="Today"
        right={
          <Link to="/settings" aria-label="Settings" className="glass flex size-11 items-center justify-center rounded-full">
            <Icon name="gear" />
          </Link>
        }
      />
    </Screen>
  );
}
```

```tsx
// app/routes/plan.tsx
import { LargeTitle, Screen } from "~/components/ui";
export default function Plan() {
  return (
    <Screen>
      <LargeTitle eyebrow="Phase 1 · Oct 5 to Jan 1" title="Plan" />
    </Screen>
  );
}
```

```tsx
// app/routes/progress.tsx
import { LargeTitle, Screen } from "~/components/ui";
export default function Progress() {
  return (
    <Screen>
      <LargeTitle eyebrow="Since Oct 5" title="Progress" />
    </Screen>
  );
}
```

```tsx
// app/routes/library.tsx
import { LargeTitle, Screen } from "~/components/ui";
export default function Library() {
  return (
    <Screen>
      <LargeTitle title="Library" />
    </Screen>
  );
}
```

```tsx
// app/routes/settings.tsx
import { Form } from "react-router";
import { BackButton, Card, LargeTitle, Screen } from "~/components/ui";

export const handle = { hideTabBar: true };

export default function Settings() {
  return (
    <Screen>
      <BackButton to="/" label="Back to Today" />
      <LargeTitle title="Settings" />
      <Card className="p-4">
        <Form method="post" action="/logout">
          <button type="submit" className="h-11 w-full rounded-full text-[17px] font-semibold text-calories">
            Sign out
          </button>
        </Form>
      </Card>
    </Screen>
  );
}
```

- [ ] **Step 5: Routes**

```ts
// app/routes.ts
import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  layout("routes/app-layout.tsx", [
    index("routes/today.tsx"),
    route("plan", "routes/plan.tsx"),
    route("progress", "routes/progress.tsx"),
    route("library", "routes/library.tsx"),
    route("settings", "routes/settings.tsx"),
  ]),
] satisfies RouteConfig;
```

```bash
rm -f app/routes/home.tsx
```

- [ ] **Step 6: Look at it**

Run: `npm run dev`, open `http://localhost:5173`.
Expected: redirected to `/login`; the password from `.dev.vars` (`rocky-local`) signs in; Today shows the large title and gear button; the floating glass tab bar switches between four screens; at 900 px wide the tab bar becomes a left sidebar; Settings hides the tab bar and Sign out returns to `/login`.

- [ ] **Step 7: Typecheck, test, commit**

Run: `npm run typecheck && npm test`
Expected: both pass.

```bash
git add -A
git commit -m "Add tab layout and placeholder screens"
```

---

### Task 9: First deploy to kampduh.com

- [ ] **Step 1: Set production secrets**

Pick the real password with Kameron (Kameron types it; never echo it into a committed file):

```bash
npx wrangler secret put APP_PASSWORD
openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET
openssl rand -hex 24 | tee /dev/stderr | npx wrangler secret put INGEST_TOKEN
echo "placeholder" | npx wrangler secret put VAPID_PUBLIC_KEY
echo "placeholder" | npx wrangler secret put VAPID_PRIVATE_KEY
```

Save the printed `INGEST_TOKEN` in Kameron's password manager; the Shortcut needs it in M6. The VAPID placeholders are replaced in M6.

Note: `wrangler secret put` on a Worker that does not exist yet creates it. If it asks to create the Worker, answer yes.

- [ ] **Step 2: Migrate the remote database**

Run: `npm run db:migrate:remote`
Expected: `0000_init.sql` applied to `rocky-db`.

- [ ] **Step 3: Deploy**

Run: `npm run deploy`
Expected: wrangler prints the custom domain `kampduh.com` as attached. First certificate issuance can take a few minutes.

- [ ] **Step 4: Verify on the wire**

```bash
curl -sI https://kampduh.com/ | head -5
```

Expected: `HTTP/2 302` with `location: /login`. Then open `https://kampduh.com` on Kameron's iPhone, sign in, and confirm the session survives closing and reopening Safari.

- [ ] **Step 5: Connect Workers Builds** (auto-deploy on push to `main`)

In the Cloudflare dashboard: Workers & Pages > `rocky` > Settings > Builds > Connect > GitHub > `kameronpduhon/rocky-the-coach`, branch `main`. Build command: `npm run build`. Deploy command: `npx wrangler deploy`. The dashboard Worker name must equal `rocky` (it does, from `wrangler.jsonc`).

Migrations are not run by Workers Builds. Any milestone that adds a migration runs `npm run db:migrate:remote` before pushing.

- [ ] **Step 6: Push and confirm the build deploys**

```bash
git push origin main
```

Expected: a build appears under the Worker's Deployments and finishes green.
