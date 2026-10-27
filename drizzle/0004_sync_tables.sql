CREATE TABLE `changes` (
	`version` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`row_key` text NOT NULL,
	`op` text NOT NULL,
	`at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile` (
	`id` text PRIMARY KEY NOT NULL,
	`voice` text DEFAULT 'corner' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_clients` (
	`client_id` text PRIMARY KEY NOT NULL,
	`last_mutation_id` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vitals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`route` text NOT NULL,
	`inp_ms` integer NOT NULL,
	`target` text,
	`at` text NOT NULL
);
