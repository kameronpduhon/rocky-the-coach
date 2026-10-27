import { defineConfig } from "drizzle-kit";
export default defineConfig({ dialect: "sqlite", schema: "./app/db/core-schema.ts", out: "./drizzle-core" });
