CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	`is_system` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `installment_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`total_amount` integer NOT NULL,
	`installment_count` integer NOT NULL,
	`paid_count` integer DEFAULT 0 NOT NULL,
	`start_date` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `movements` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`description` text NOT NULL,
	`category_id` text NOT NULL,
	`status` text NOT NULL,
	`date` text NOT NULL,
	`created_at` text NOT NULL,
	`recurring_id` text,
	`installment_id` text,
	`split_group_id` text,
	`split_from` text,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `movements_date_idx` ON `movements` (`date`);--> statement-breakpoint
CREATE INDEX `movements_status_idx` ON `movements` (`status`);--> statement-breakpoint
CREATE INDEX `movements_installment_idx` ON `movements` (`installment_id`);