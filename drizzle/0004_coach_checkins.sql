ALTER TABLE `centers` ADD COLUMN `latitude` decimal(9,6);--> statement-breakpoint
ALTER TABLE `centers` ADD COLUMN `longitude` decimal(9,6);--> statement-breakpoint
ALTER TABLE `centers` ADD COLUMN `radius_m` int NOT NULL DEFAULT 200;--> statement-breakpoint
CREATE TABLE `coach_checkins` (
	`id` char(26) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`batch_id` char(26) NOT NULL,
	`session_date` date NOT NULL,
	`checked_in_at` datetime NOT NULL,
	`latitude` decimal(9,6),
	`longitude` decimal(9,6),
	`accuracy_m` int,
	`distance_m` int,
	`status` enum('on_site','off_site','unknown') NOT NULL DEFAULT 'unknown',
	`late_minutes` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `coach_checkins_id` PRIMARY KEY(`id`),
	CONSTRAINT `coach_checkins_user_batch_date_uq` UNIQUE(`user_id`,`batch_id`,`session_date`)
);--> statement-breakpoint
ALTER TABLE `coach_checkins` ADD CONSTRAINT `coach_checkins_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `coach_checkins` ADD CONSTRAINT `coach_checkins_batch_id_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `coach_checkins_date_idx` ON `coach_checkins` (`session_date`);
