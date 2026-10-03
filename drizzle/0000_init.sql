CREATE TABLE `batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meal_slug` text NOT NULL,
	`portions` integer NOT NULL,
	`cooked_weight_g` integer NOT NULL,
	`portion_g` integer NOT NULL,
	`created_on` text NOT NULL,
	`portions_left` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `check_ins` (
	`week_start` text PRIMARY KEY NOT NULL,
	`avg_weight` real,
	`change` real,
	`adherence` integer NOT NULL,
	`outcome` text NOT NULL,
	`completed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `exercise_overrides` (
	`template_id` text NOT NULL,
	`position` integer NOT NULL,
	`exercise_id` text NOT NULL,
	PRIMARY KEY(`template_id`, `position`)
);
--> statement-breakpoint
CREATE TABLE `exercise_swaps` (
	`date` text NOT NULL,
	`template_id` text NOT NULL,
	`position` integer NOT NULL,
	`exercise_id` text NOT NULL,
	PRIMARY KEY(`date`, `template_id`, `position`)
);
--> statement-breakpoint
CREATE TABLE `grocery_checks` (
	`week_start` text NOT NULL,
	`food_id` text NOT NULL,
	PRIMARY KEY(`week_start`, `food_id`)
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip` text NOT NULL,
	`attempted_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meal_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`slot` text,
	`meal_slug` text,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`kcal` integer NOT NULL,
	`protein_g` integer NOT NULL,
	`relaxed` integer DEFAULT false NOT NULL,
	`portions` integer DEFAULT 1 NOT NULL,
	`logged_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meal_logs_date` ON `meal_logs` (`date`);--> statement-breakpoint
CREATE TABLE `meal_state` (
	`slug` text PRIMARY KEY NOT NULL,
	`photo_key` text,
	`rested_until` text
);
--> statement-breakpoint
CREATE TABLE `notifications_sent` (
	`kind` text NOT NULL,
	`date` text NOT NULL,
	PRIMARY KEY(`kind`, `date`)
);
--> statement-breakpoint
CREATE TABLE `planned_meals` (
	`date` text NOT NULL,
	`slot` text NOT NULL,
	`meal_slug` text NOT NULL,
	`swapped` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`date`, `slot`)
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reminder_settings` (
	`kind` text PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL,
	`time` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `set_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`exercise_id` text NOT NULL,
	`position` integer NOT NULL,
	`set_number` integer NOT NULL,
	`weight_lb` real NOT NULL,
	`reps` integer NOT NULL,
	`logged_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `set_logs_exercise` ON `set_logs` (`exercise_id`);--> statement-breakpoint
CREATE INDEX `set_logs_session` ON `set_logs` (`session_id`);--> statement-breakpoint
CREATE TABLE `steps_daily` (
	`date` text PRIMARY KEY NOT NULL,
	`steps` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `targets` (
	`effective_from` text PRIMARY KEY NOT NULL,
	`kcal` integer NOT NULL,
	`protein_g` integer NOT NULL,
	`step_goal` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `waist_logs` (
	`date` text PRIMARY KEY NOT NULL,
	`inches` real NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weigh_ins` (
	`date` text PRIMARY KEY NOT NULL,
	`weight_lb` real NOT NULL,
	`logged_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`template_id` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text
);
--> statement-breakpoint
CREATE INDEX `workout_sessions_date` ON `workout_sessions` (`date`);