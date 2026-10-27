declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    TEST_CORE_MIGRATIONS: import("cloudflare:test").D1Migration[];
    MIGRATION_TEST: D1Database;
  }
}
