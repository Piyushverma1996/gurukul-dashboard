CREATE TABLE `attendance` (
	`id` char(26) NOT NULL,
	`batch_id` char(26) NOT NULL,
	`student_id` char(26) NOT NULL,
	`session_date` date NOT NULL,
	`status` enum('present','absent','excused') NOT NULL,
	`marked_by` varchar(36),
	`marked_at` datetime NOT NULL,
	CONSTRAINT `attendance_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_student_batch_date_uq` UNIQUE(`student_id`,`batch_id`,`session_date`)
);
--> statement-breakpoint
CREATE TABLE `dues` (
	`id` char(26) NOT NULL,
	`student_id` char(26) NOT NULL,
	`month` char(7) NOT NULL,
	`base_amount` int NOT NULL,
	`discount_amount` int NOT NULL DEFAULT 0,
	`amount_due` int NOT NULL,
	`due_date` date NOT NULL,
	`is_prorated` boolean NOT NULL DEFAULT false,
	`waived` boolean NOT NULL DEFAULT false,
	`waived_reason` varchar(255),
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `dues_id` PRIMARY KEY(`id`),
	CONSTRAINT `dues_student_month_uq` UNIQUE(`student_id`,`month`)
);
--> statement-breakpoint
CREATE TABLE `fee_plans` (
	`id` char(26) NOT NULL,
	`center_id` char(26),
	`age_category` enum('U8','U10','U12','U14','U16','U19','SENIOR'),
	`monthly_amount` int NOT NULL,
	`effective_from` date NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `fee_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_allocations` (
	`payment_id` char(26) NOT NULL,
	`due_id` char(26) NOT NULL,
	`amount` int NOT NULL,
	CONSTRAINT `payment_allocations_payment_id_due_id_pk` PRIMARY KEY(`payment_id`,`due_id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` char(26) NOT NULL,
	`student_id` char(26) NOT NULL,
	`amount` int NOT NULL,
	`method` enum('paytm','cash','register') NOT NULL,
	`txn_ref` varchar(80),
	`collected_by` varchar(36),
	`received_at` date NOT NULL,
	`status` enum('pending_verification','verified','rejected') NOT NULL,
	`verified_by` varchar(36),
	`verified_at` datetime,
	`rejection_reason` varchar(255),
	`notes` text,
	`idempotency_key` varchar(64) NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_idempotency_key_unique` UNIQUE(`idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE `prepaid_marks` (
	`id` char(26) NOT NULL,
	`student_id` char(26) NOT NULL,
	`month` char(7) NOT NULL,
	`source` varchar(20) NOT NULL DEFAULT 'register',
	`note` varchar(255),
	`applied_payment_id` char(26),
	`created_at` datetime NOT NULL,
	CONSTRAINT `prepaid_marks_id` PRIMARY KEY(`id`),
	CONSTRAINT `prepaid_marks_student_month_uq` UNIQUE(`student_id`,`month`)
);
--> statement-breakpoint
CREATE TABLE `reminders_log` (
	`id` char(26) NOT NULL,
	`student_id` char(26) NOT NULL,
	`month` char(7),
	`channel` enum('wa_link','wa_api') NOT NULL,
	`sent_by` varchar(36),
	`sent_at` datetime NOT NULL,
	`message` text NOT NULL,
	CONSTRAINT `reminders_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sheet_sync_state` (
	`student_id` char(26) NOT NULL,
	`last_pushed_json` text NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `sheet_sync_state_student_id` PRIMARY KEY(`student_id`)
);
--> statement-breakpoint
ALTER TABLE `students` MODIFY COLUMN `parent_name` varchar(120);--> statement-breakpoint
ALTER TABLE `students` MODIFY COLUMN `parent_phone` varchar(20);--> statement-breakpoint
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_batch_id_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_marked_by_user_id_fk` FOREIGN KEY (`marked_by`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dues` ADD CONSTRAINT `dues_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fee_plans` ADD CONSTRAINT `fee_plans_center_id_centers_id_fk` FOREIGN KEY (`center_id`) REFERENCES `centers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_allocations` ADD CONSTRAINT `payment_allocations_payment_id_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_allocations` ADD CONSTRAINT `payment_allocations_due_id_dues_id_fk` FOREIGN KEY (`due_id`) REFERENCES `dues`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_collected_by_user_id_fk` FOREIGN KEY (`collected_by`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_verified_by_user_id_fk` FOREIGN KEY (`verified_by`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `prepaid_marks` ADD CONSTRAINT `prepaid_marks_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reminders_log` ADD CONSTRAINT `reminders_log_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reminders_log` ADD CONSTRAINT `reminders_log_sent_by_user_id_fk` FOREIGN KEY (`sent_by`) REFERENCES `user`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sheet_sync_state` ADD CONSTRAINT `sheet_sync_state_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `attendance_batch_date_idx` ON `attendance` (`batch_id`,`session_date`);--> statement-breakpoint
CREATE INDEX `dues_month_idx` ON `dues` (`month`);--> statement-breakpoint
CREATE INDEX `fee_plans_center_idx` ON `fee_plans` (`center_id`);--> statement-breakpoint
CREATE INDEX `payment_allocations_due_idx` ON `payment_allocations` (`due_id`);--> statement-breakpoint
CREATE INDEX `payments_student_idx` ON `payments` (`student_id`);--> statement-breakpoint
CREATE INDEX `payments_status_idx` ON `payments` (`status`);--> statement-breakpoint
CREATE INDEX `reminders_student_idx` ON `reminders_log` (`student_id`);