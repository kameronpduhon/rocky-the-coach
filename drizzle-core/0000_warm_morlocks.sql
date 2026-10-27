CREATE TABLE `households` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ip` text NOT NULL,
	`attempted_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`household_id` integer NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`password_hash` text,
	`ingest_token` text,
	`db_binding` text NOT NULL,
	`plan_key` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_name_key_unique` ON `users` (`name_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_ingest_token_unique` ON `users` (`ingest_token`);