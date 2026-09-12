CREATE TABLE `account` (
	`id` varchar(36) NOT NULL,
	`account_id` varchar(255) NOT NULL,
	`provider_id` varchar(64) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` datetime,
	`refresh_token_expires_at` datetime,
	`scope` text,
	`password` text,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `account_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` char(26) NOT NULL,
	`actor_id` varchar(36),
	`action` varchar(64) NOT NULL,
	`entity` varchar(40) NOT NULL,
	`entity_id` varchar(36) NOT NULL,
	`before_json` text,
	`after_json` text,
	`at` datetime NOT NULL,
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `batch_coaches` (
	`batch_id` char(26) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`created_at` datetime NOT NULL,
	CONSTRAINT `batch_coaches_batch_id_user_id_pk` PRIMARY KEY(`batch_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `batches` (
	`id` char(26) NOT NULL,
	`center_id` char(26) NOT NULL,
	`name` varchar(80) NOT NULL,
	`age_category` enum('U8','U10','U12','U14','U16','U19','SENIOR') NOT NULL,
	`days_of_week` varchar(40) NOT NULL,
	`start_time` time NOT NULL,
	`end_time` time NOT NULL,
	`head_coach_id` varchar(36),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `batches_center_name_uq` UNIQUE(`center_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `centers` (
	`id` char(26) NOT NULL,
	`name` varchar(120) NOT NULL,
	`sector` varchar(40) NOT NULL,
	`address` varchar(255),
	`map_url` varchar(500),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `centers_id` PRIMARY KEY(`id`),
	CONSTRAINT `centers_name_uq` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` varchar(36) NOT NULL,
	`expires_at` datetime NOT NULL,
	`token` varchar(255) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` varchar(36) NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `session_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(64) NOT NULL,
	`value` text NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` char(26) NOT NULL,
	`name` varchar(120) NOT NULL,
	`parent_name` varchar(120) NOT NULL,
	`parent_phone` varchar(20) NOT NULL,
	`dob` date,
	`age_category` enum('U8','U10','U12','U14','U16','U19','SENIOR') NOT NULL,
	`batch_id` char(26) NOT NULL,
	`joining_date` date NOT NULL,
	`fee_due_day` tinyint NOT NULL DEFAULT 1,
	`custom_fee` int,
	`discount_type` enum('flat','percent'),
	`discount_value` int,
	`status` enum('active','paused','left') NOT NULL DEFAULT 'active',
	`status_changed_at` datetime,
	`consent_given` boolean NOT NULL DEFAULT false,
	`consent_date` date,
	`notes` text,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `students_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`image` text,
	`role` enum('admin','head_coach','assistant_coach') NOT NULL DEFAULT 'assistant_coach',
	`is_active` boolean NOT NULL DEFAULT true,
	`must_change_password` boolean NOT NULL DEFAULT false,
	`phone_number` varchar(20),
	`phone_number_verified` boolean,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `user_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_email_unique` UNIQUE(`email`),
	CONSTRAINT `user_phone_number_unique` UNIQUE(`phone_number`)
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` varchar(36) NOT NULL,
	`identifier` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`expires_at` datetime NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `verification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `account` ADD CONSTRAINT `account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `batch_coaches` ADD CONSTRAINT `batch_coaches_batch_id_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `batch_coaches` ADD CONSTRAINT `batch_coaches_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `batches` ADD CONSTRAINT `batches_center_id_centers_id_fk` FOREIGN KEY (`center_id`) REFERENCES `centers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `batches` ADD CONSTRAINT `batches_head_coach_id_user_id_fk` FOREIGN KEY (`head_coach_id`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session` ADD CONSTRAINT `session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_batch_id_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `account_user_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_log` (`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_at_idx` ON `audit_log` (`at`);--> statement-breakpoint
CREATE INDEX `batch_coaches_user_idx` ON `batch_coaches` (`user_id`);--> statement-breakpoint
CREATE INDEX `batches_center_idx` ON `batches` (`center_id`);--> statement-breakpoint
CREATE INDEX `batches_head_coach_idx` ON `batches` (`head_coach_id`);--> statement-breakpoint
CREATE INDEX `session_user_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `students_batch_idx` ON `students` (`batch_id`);--> statement-breakpoint
CREATE INDEX `students_status_idx` ON `students` (`status`);--> statement-breakpoint
CREATE INDEX `students_parent_phone_idx` ON `students` (`parent_phone`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);