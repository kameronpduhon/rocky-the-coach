INSERT INTO households (id, name) VALUES (1, 'Duhon');
--> statement-breakpoint
INSERT INTO users (id, household_id, name, name_key, db_binding, plan_key, created_at) VALUES
  (1, 1, 'Kameron', 'kameron', 'DB', 'kameron', '2026-10-27T00:00:00.000Z'),
  (2, 1, 'Catherine', 'catherine', 'DB_CATHERINE', NULL, '2026-10-27T00:00:00.000Z');
