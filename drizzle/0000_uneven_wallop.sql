CREATE TABLE `match_players` (
	`match_id` text NOT NULL,
	`player_id` text NOT NULL,
	`side` text NOT NULL,
	`position` text NOT NULL,
	PRIMARY KEY(`match_id`, `player_id`)
);
--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`red_score` integer NOT NULL,
	`blue_score` integer NOT NULL,
	`red_elo_before` integer NOT NULL,
	`blue_elo_before` integer NOT NULL,
	`elo_delta` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`name` text NOT NULL,
	`preferred_position` text DEFAULT 'polyvalent' NOT NULL,
	`elo` integer DEFAULT 1000 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`games` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `players_email_unique` ON `players` (`email`);