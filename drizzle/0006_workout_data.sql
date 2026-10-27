CREATE TABLE `exercise_notes` (
	`exercise_id` text PRIMARY KEY NOT NULL,
	`note` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `__new_workout_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`template_id` text NOT NULL,
	`started_at` text,
	`ended_at` text,
	`exercises` text,
	`client_id` text,
	`planned_at` text,
	`lifts` text,
	`feel` text
);
--> statement-breakpoint
INSERT INTO `__new_workout_sessions`("id", "date", "template_id", "started_at", "ended_at", "exercises") SELECT "id", "date", "template_id", "started_at", "ended_at", "exercises" FROM `workout_sessions`;--> statement-breakpoint
DROP TABLE `workout_sessions`;--> statement-breakpoint
ALTER TABLE `__new_workout_sessions` RENAME TO `workout_sessions`;--> statement-breakpoint
CREATE UNIQUE INDEX `workout_sessions_client_id_unique` ON `workout_sessions` (`client_id`);--> statement-breakpoint
CREATE INDEX `workout_sessions_date` ON `workout_sessions` (`date`);--> statement-breakpoint
ALTER TABLE `exercise_checks` ADD `session_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `set_logs` ADD `session_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `set_logs` SET `session_key` = 'id:' || `session_id` WHERE `session_key` = '';
--> statement-breakpoint
UPDATE `exercise_checks` SET `session_key` = 'id:' || `session_id` WHERE `session_key` = '';
--> statement-breakpoint
CREATE UNIQUE INDEX `exercise_checks_session_key` ON `exercise_checks` (`session_key`,`exercise_id`);