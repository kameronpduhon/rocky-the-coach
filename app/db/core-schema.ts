import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const households = sqliteTable("households", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  householdId: integer("household_id")
    .notNull()
    .references(() => households.id),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull().unique(),
  passwordHash: text("password_hash"),
  ingestToken: text("ingest_token").unique(),
  // Which D1 binding holds this person's data: "DB" or "DB_CATHERINE".
  dbBinding: text("db_binding").notNull(),
  // Which plan in content/ this person follows. Null until their plan is written.
  planKey: text("plan_key"),
  createdAt: text("created_at").notNull(),
});

export const loginAttempts = sqliteTable("login_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ip: text("ip").notNull(),
  attemptedAt: text("attempted_at").notNull(),
});
