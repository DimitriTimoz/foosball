import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  email: text("email").unique(),
  name: text("name").notNull(),
  preferredPosition: text("preferred_position").notNull().default("polyvalent"),
  elo: integer("elo").notNull().default(1000),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  games: integer("games").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const matches = sqliteTable(
  "matches",
  {
    id: text("id").primaryKey(),
    redScore: integer("red_score").notNull(),
    blueScore: integer("blue_score").notNull(),
    redEloBefore: integer("red_elo_before").notNull(),
    blueEloBefore: integer("blue_elo_before").notNull(),
    eloDelta: integer("elo_delta").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("matches_created_at_idx").on(table.createdAt)],
);

export const matchPlayers = sqliteTable(
  "match_players",
  {
    matchId: text("match_id").notNull(),
    playerId: text("player_id").notNull(),
    side: text("side").notNull(),
    position: text("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.matchId, table.playerId] }),
    index("match_players_player_idx").on(table.playerId),
  ],
);
