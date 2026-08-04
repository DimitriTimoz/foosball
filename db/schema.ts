import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  email: text("email").unique(),
  name: text("name").notNull(),
  preferredPosition: text("preferred_position").notNull().default("polyvalent"),
  elo: integer("elo").notNull().default(1000),
  attackElo: integer("attack_elo").notNull().default(1000),
  defenseElo: integer("defense_elo").notNull().default(1000),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  games: integer("games").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedBy: text("used_by"),
    usedAt: integer("used_at"),
  },
  (table) => [index("invitations_expires_at_idx").on(table.expiresAt)],
);

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

export const tournaments = sqliteTable(
  "tournaments",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    currentRound: integer("current_round").notNull().default(1),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (table) => [index("tournaments_status_idx").on(table.status, table.createdAt)],
);

export const tournamentPlayers = sqliteTable(
  "tournament_players",
  {
    tournamentId: text("tournament_id").notNull(),
    playerId: text("player_id").notNull(),
    joinedRound: integer("joined_round").notNull().default(1),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tournamentId, table.playerId] }),
    index("tournament_players_player_idx").on(table.playerId),
  ],
);

export const tournamentMatches = sqliteTable(
  "tournament_matches",
  {
    id: text("id").primaryKey(),
    tournamentId: text("tournament_id").notNull(),
    roundNumber: integer("round_number").notNull(),
    status: text("status").notNull().default("pending"),
    redScore: integer("red_score"),
    blueScore: integer("blue_score"),
    matchId: text("match_id"),
    createdAt: integer("created_at").notNull(),
    completedAt: integer("completed_at"),
  },
  (table) => [index("tournament_matches_round_idx").on(table.tournamentId, table.roundNumber)],
);

export const tournamentMatchPlayers = sqliteTable(
  "tournament_match_players",
  {
    tournamentMatchId: text("tournament_match_id").notNull(),
    playerId: text("player_id").notNull(),
    side: text("side").notNull(),
    position: text("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tournamentMatchId, table.playerId] }),
    index("tournament_match_players_player_idx").on(table.playerId),
  ],
);
