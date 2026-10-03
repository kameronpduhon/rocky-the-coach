ALTER TABLE `meal_logs` ADD `client_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `meal_logs_client_id_unique` ON `meal_logs` (`client_id`);--> statement-breakpoint
ALTER TABLE `set_logs` ADD `client_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `set_logs_client_id_unique` ON `set_logs` (`client_id`);