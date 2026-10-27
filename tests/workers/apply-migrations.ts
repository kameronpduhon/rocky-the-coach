import { applyD1Migrations, env } from "cloudflare:test";
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
await applyD1Migrations(env.DB_CATHERINE, env.TEST_MIGRATIONS);
await applyD1Migrations(env.CORE, env.TEST_CORE_MIGRATIONS);
