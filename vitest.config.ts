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
