CREATE TABLE `lift_drops` (
	`exercise_id` text PRIMARY KEY NOT NULL,
	`weight_lb` real NOT NULL,
	`from_date` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `check_ins` ADD `hunger` text;--> statement-breakpoint
ALTER TABLE `check_ins` ADD `energy` text;--> statement-breakpoint
ALTER TABLE `check_ins` ADD `sleep` text;