ALTER TABLE `batches` MODIFY COLUMN `age_category` enum('U8','U10','U12','U13','U14','U15','U16','U18','U19','SENIOR','ELITE') NOT NULL;--> statement-breakpoint
ALTER TABLE `students` MODIFY COLUMN `age_category` enum('U8','U10','U12','U13','U14','U15','U16','U18','U19','SENIOR','ELITE') NOT NULL;--> statement-breakpoint
ALTER TABLE `fee_plans` MODIFY COLUMN `age_category` enum('U8','U10','U12','U13','U14','U15','U16','U18','U19','SENIOR','ELITE');
