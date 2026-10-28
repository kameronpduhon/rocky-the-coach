CREATE TABLE `ai_calls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text NOT NULL,
	`kind` text NOT NULL,
	`ok` integer NOT NULL,
	`reason` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `facts` (
	`client_id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`dated` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `takes` (
	`week_start` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`hash` text NOT NULL,
	`voice` text NOT NULL,
	`writes` integer DEFAULT 1 NOT NULL,
	`written_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `profile` ADD `ai` integer DEFAULT 1 NOT NULL;