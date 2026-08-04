CREATE TABLE `tournament_match_players` (
	`tournament_match_id` text NOT NULL,
	`player_id` text NOT NULL,
	`side` text NOT NULL,
	`position` text NOT NULL,
	PRIMARY KEY(`tournament_match_id`, `player_id`)
);
--> statement-breakpoint
CREATE INDEX `tournament_match_players_player_idx` ON `tournament_match_players` (`player_id`);--> statement-breakpoint
CREATE TABLE `tournament_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`round_number` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`red_score` integer,
	`blue_score` integer,
	`match_id` text,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `tournament_matches_round_idx` ON `tournament_matches` (`tournament_id`,`round_number`);--> statement-breakpoint
CREATE TABLE `tournament_players` (
	`tournament_id` text NOT NULL,
	`player_id` text NOT NULL,
	`joined_round` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`tournament_id`, `player_id`)
);
--> statement-breakpoint
CREATE INDEX `tournament_players_player_idx` ON `tournament_players` (`player_id`);--> statement-breakpoint
CREATE TABLE `tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_round` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `tournaments_status_idx` ON `tournaments` (`status`,`created_at`);