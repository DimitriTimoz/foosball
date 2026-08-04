ALTER TABLE `players` ADD `attack_elo` integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `defense_elo` integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
UPDATE `players` SET `attack_elo` = 1000 + COALESCE((
  SELECT SUM(CASE
    WHEN (`mp`.`side` = 'red' AND `m`.`red_score` > `m`.`blue_score`) OR (`mp`.`side` = 'blue' AND `m`.`blue_score` > `m`.`red_score`)
    THEN `m`.`elo_delta` ELSE -`m`.`elo_delta` END)
  FROM `match_players` `mp` JOIN `matches` `m` ON `m`.`id` = `mp`.`match_id`
  WHERE `mp`.`player_id` = `players`.`id` AND `mp`.`position` = 'attaquant'
), 0);--> statement-breakpoint
UPDATE `players` SET `defense_elo` = 1000 + COALESCE((
  SELECT SUM(CASE
    WHEN (`mp`.`side` = 'red' AND `m`.`red_score` > `m`.`blue_score`) OR (`mp`.`side` = 'blue' AND `m`.`blue_score` > `m`.`red_score`)
    THEN `m`.`elo_delta` ELSE -`m`.`elo_delta` END)
  FROM `match_players` `mp` JOIN `matches` `m` ON `m`.`id` = `mp`.`match_id`
  WHERE `mp`.`player_id` = `players`.`id` AND `mp`.`position` = 'defenseur'
), 0);
