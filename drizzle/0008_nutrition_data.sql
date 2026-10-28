CREATE TABLE `usual_orders` (
	`client_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`kcal` integer NOT NULL,
	`protein_g` integer NOT NULL,
	`relaxed` integer DEFAULT false NOT NULL,
	`uses` integer DEFAULT 0 NOT NULL,
	`last_used_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `batches` ADD `client_id` text;--> statement-breakpoint
ALTER TABLE `batches` ADD `factor` real DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `batches_client_id_unique` ON `batches` (`client_id`);--> statement-breakpoint
ALTER TABLE `check_ins` ADD `burn` integer;--> statement-breakpoint
ALTER TABLE `check_ins` ADD `burn_state` text;--> statement-breakpoint
ALTER TABLE `check_ins` ADD `intake_avg` integer;--> statement-breakpoint
ALTER TABLE `check_ins` ADD `tracked_days` integer;