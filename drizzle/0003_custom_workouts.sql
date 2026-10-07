CREATE TABLE `exercise_checks` (
	`session_id` integer NOT NULL,
	`exercise_id` text NOT NULL,
	PRIMARY KEY(`session_id`, `exercise_id`)
);
--> statement-breakpoint
ALTER TABLE `workout_sessions` ADD `exercises` text;