import { env } from "cloudflare:workers";

export type Position = "attaquant" | "defenseur";
export type Side = "red" | "blue";

export type MatchMember = { id: string; position: Position };

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT NOT NULL,
    preferred_position TEXT NOT NULL DEFAULT 'polyvalent',
    elo INTEGER NOT NULL DEFAULT 1000,
    attack_elo INTEGER NOT NULL DEFAULT 1000,
    defense_elo INTEGER NOT NULL DEFAULT 1000,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    games INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    red_score INTEGER NOT NULL,
    blue_score INTEGER NOT NULL,
    red_elo_before INTEGER NOT NULL,
    blue_elo_before INTEGER NOT NULL,
    elo_delta INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS match_players (
    match_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('red', 'blue')),
    position TEXT NOT NULL CHECK(position IN ('attaquant', 'defenseur')),
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS invitations (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_by TEXT,
    used_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    current_round INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_players (
    tournament_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    joined_round INTEGER NOT NULL DEFAULT 1,
    left_round INTEGER,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (tournament_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_matches (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    round_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    red_score INTEGER,
    blue_score INTEGER,
    match_id TEXT,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS tournament_match_players (
    tournament_match_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('red', 'blue')),
    position TEXT NOT NULL CHECK(position IN ('attaquant', 'defenseur')),
    PRIMARY KEY (tournament_match_id, player_id)
  )`,
  "CREATE INDEX IF NOT EXISTS matches_created_at_idx ON matches (created_at DESC)",
  "CREATE INDEX IF NOT EXISTS match_players_player_idx ON match_players (player_id)",
  "CREATE INDEX IF NOT EXISTS invitations_expires_at_idx ON invitations (expires_at)",
  "CREATE INDEX IF NOT EXISTS tournaments_status_idx ON tournaments (status, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS tournament_players_player_idx ON tournament_players (player_id)",
  "CREATE INDEX IF NOT EXISTS tournament_matches_round_idx ON tournament_matches (tournament_id, round_number)",
  "CREATE INDEX IF NOT EXISTS tournament_match_players_player_idx ON tournament_match_players (player_id)",
];

function d1() {
  const runtimeEnv = env as unknown as { DB?: D1Database };
  if (!runtimeEnv.DB) throw new Error("La base de données n’est pas disponible.");
  return runtimeEnv.DB;
}

export async function initializeDatabase() {
  const db = d1();
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  const columns = await db.prepare("PRAGMA table_info(players)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  if (!names.has("attack_elo")) {
    await db.prepare("ALTER TABLE players ADD COLUMN attack_elo INTEGER NOT NULL DEFAULT 1000").run();
    await db.prepare(`UPDATE players SET attack_elo = 1000 + COALESCE((
      SELECT SUM(CASE
        WHEN (mp.side = 'red' AND m.red_score > m.blue_score) OR (mp.side = 'blue' AND m.blue_score > m.red_score)
        THEN m.elo_delta ELSE -m.elo_delta END)
      FROM match_players mp JOIN matches m ON m.id = mp.match_id
      WHERE mp.player_id = players.id AND mp.position = 'attaquant'
    ), 0)`).run();
  }
  if (!names.has("defense_elo")) {
    await db.prepare("ALTER TABLE players ADD COLUMN defense_elo INTEGER NOT NULL DEFAULT 1000").run();
    await db.prepare(`UPDATE players SET defense_elo = 1000 + COALESCE((
      SELECT SUM(CASE
        WHEN (mp.side = 'red' AND m.red_score > m.blue_score) OR (mp.side = 'blue' AND m.blue_score > m.red_score)
        THEN m.elo_delta ELSE -m.elo_delta END)
      FROM match_players mp JOIN matches m ON m.id = mp.match_id
      WHERE mp.player_id = players.id AND mp.position = 'defenseur'
    ), 0)`).run();
  }
  const tournamentPlayerColumns = await db.prepare("PRAGMA table_info(tournament_players)").all<{ name: string }>();
  if (!tournamentPlayerColumns.results.some((column) => column.name === "left_round")) {
    await db.prepare("ALTER TABLE tournament_players ADD COLUMN left_round INTEGER").run();
  }
}

export async function ensurePlayer(email: string, name: string) {
  const db = d1();
  const existing = await db
    .prepare("SELECT * FROM players WHERE email = ? LIMIT 1")
    .bind(email)
    .first();
  if (existing) return existing;
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO players (id, email, name, preferred_position, elo, wins, losses, games, created_at) VALUES (?, ?, ?, 'polyvalent', 1000, 0, 0, 0, ?)",
    )
    .bind(id, email, name, Date.now())
    .run();
  return db.prepare("SELECT * FROM players WHERE id = ?").bind(id).first();
}

export async function getPlayerByEmail(email: string) {
  return d1().prepare("SELECT * FROM players WHERE email = ? LIMIT 1").bind(email).first();
}

export async function ensureInitialMember(email: string, name: string) {
  const db = d1();
  const existing = await getPlayerByEmail(email);
  if (existing) return existing;
  const count = await db
    .prepare("SELECT COUNT(*) AS count FROM players WHERE email IS NOT NULL")
    .first<{ count: number }>();
  if ((count?.count ?? 0) > 0) return null;
  return ensurePlayer(email, name);
}

export async function createInvitation(createdBy: string) {
  const tokenBytes = new Uint8Array(24);
  crypto.getRandomValues(tokenBytes);
  const token = bytesToBase64Url(tokenBytes);
  const tokenHash = await hashToken(token);
  const now = Date.now();
  const expiresAt = now + 7 * 24 * 60 * 60 * 1000;
  await d1()
    .prepare(
      "INSERT INTO invitations (id, token_hash, created_by, created_at, expires_at, used_by, used_at) VALUES (?, ?, ?, ?, ?, NULL, NULL)",
    )
    .bind(crypto.randomUUID(), tokenHash, createdBy, now, expiresAt)
    .run();
  return { token, expiresAt };
}

export async function redeemInvitation(token: string, email: string, name: string) {
  const existing = await getPlayerByEmail(email);
  if (existing) return existing;
  if (token.length < 20 || token.length > 80) throw new Error("Ce lien d’invitation est invalide.");
  const db = d1();
  const tokenHash = await hashToken(token);
  const invitation = await db
    .prepare(
      "SELECT id FROM invitations WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? LIMIT 1",
    )
    .bind(tokenHash, Date.now())
    .first<{ id: string }>();
  if (!invitation) throw new Error("Ce lien d’invitation est expiré ou a déjà été utilisé.");

  const claimed = await db
    .prepare(
      "UPDATE invitations SET used_by = ?, used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?",
    )
    .bind(email, Date.now(), invitation.id, Date.now())
    .run();
  if ((claimed.meta.changes ?? 0) !== 1) {
    throw new Error("Ce lien d’invitation vient d’être utilisé.");
  }
  return ensurePlayer(email, name);
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToBase64Url(new Uint8Array(digest));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function addPlayer(name: string, preferredPosition: string) {
  const db = d1();
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO players (id, email, name, preferred_position, elo, wins, losses, games, created_at) VALUES (?, NULL, ?, ?, 1000, 0, 0, 0, ?)",
    )
    .bind(id, name, preferredPosition, Date.now())
    .run();
  return db.prepare("SELECT * FROM players WHERE id = ?").bind(id).first();
}

export async function getDashboard() {
  const db = d1();
  const playersResult = await db
    .prepare("SELECT * FROM players ORDER BY elo DESC, wins DESC, name ASC")
    .all();
  const matchesResult = await db
    .prepare("SELECT * FROM matches ORDER BY created_at DESC LIMIT 50")
    .all();
  const memberResult = await db
    .prepare(
      `SELECT mp.match_id, mp.side, mp.position, p.id, p.name
       FROM match_players mp JOIN players p ON p.id = mp.player_id
       WHERE mp.match_id IN (SELECT id FROM matches ORDER BY created_at DESC LIMIT 50)
       ORDER BY mp.side, mp.position`,
    )
    .all();
  const leagueStats = await db
    .prepare(
      `SELECT
         COUNT(*) AS total_matches,
         COALESCE(SUM(red_score + blue_score), 0) AS total_goals,
         COALESCE(ROUND(AVG(red_score + blue_score), 1), 0) AS avg_goals,
         COALESCE(ROUND(AVG(ABS(red_score - blue_score)), 1), 0) AS avg_margin,
         COALESCE(SUM(CASE WHEN red_score > blue_score THEN 1 ELSE 0 END), 0) AS red_wins,
         COALESCE(SUM(CASE WHEN blue_score > red_score THEN 1 ELSE 0 END), 0) AS blue_wins,
         COALESCE(SUM(CASE WHEN ABS(red_score - blue_score) <= 2 THEN 1 ELSE 0 END), 0) AS close_matches
       FROM matches`,
    )
    .first();
  const sideStatsResult = await db
    .prepare(
      `SELECT p.id, p.name,
         COALESCE(SUM(CASE WHEN mp.side = 'red' THEN 1 ELSE 0 END), 0) AS red_games,
         COALESCE(SUM(CASE WHEN mp.side = 'red' AND m.red_score > m.blue_score THEN 1 ELSE 0 END), 0) AS red_wins,
         COALESCE(SUM(CASE WHEN mp.side = 'blue' THEN 1 ELSE 0 END), 0) AS blue_games,
         COALESCE(SUM(CASE WHEN mp.side = 'blue' AND m.blue_score > m.red_score THEN 1 ELSE 0 END), 0) AS blue_wins
       FROM players p
       LEFT JOIN match_players mp ON mp.player_id = p.id
       LEFT JOIN matches m ON m.id = mp.match_id
       GROUP BY p.id, p.name
       ORDER BY (red_games + blue_games) DESC, p.name ASC`,
    )
    .all();

  const members = memberResult.results as Array<Record<string, unknown>>;
  const matches = (matchesResult.results as Array<Record<string, unknown>>).map((match) => ({
    ...match,
    red: members.filter((member) => member.match_id === match.id && member.side === "red"),
    blue: members.filter((member) => member.match_id === match.id && member.side === "blue"),
  }));

  return { players: playersResult.results, matches, leagueStats, sideStats: sideStatsResult.results };
}

export async function addMatch(args: {
  red: MatchMember[];
  blue: MatchMember[];
  redScore: number;
  blueScore: number;
  createdBy: string;
}) {
  const db = d1();
  const playerIds = [...args.red, ...args.blue].map((member) => member.id);
  if (![1, 2].includes(args.red.length) || ![1, 2].includes(args.blue.length)) {
    throw new Error("Chaque côté doit avoir un ou deux joueurs.");
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error("Un joueur ne peut apparaître qu’une fois.");
  }
  if (args.redScore === args.blueScore) throw new Error("Le score final ne peut pas être nul.");
  if ([args.redScore, args.blueScore].some((score) => !Number.isInteger(score) || score < 0 || score > 99)) {
    throw new Error("Le score doit être compris entre 0 et 99.");
  }

  const placeholders = playerIds.map(() => "?").join(",");
  const rows = await db
    .prepare(`SELECT id, elo, attack_elo, defense_elo FROM players WHERE id IN (${placeholders})`)
    .bind(...playerIds)
    .all();
  if (rows.results.length !== playerIds.length) throw new Error("Un joueur est introuvable.");
  const ratings = new Map(
    (rows.results as Array<{ id: string; elo: number; attack_elo: number; defense_elo: number }>).map((row) => [row.id, row]),
  );
  const average = (members: MatchMember[]) =>
    Math.round(
      members.reduce((sum, member) => {
        const rating = ratings.get(member.id);
        return sum + ((member.position === "attaquant" ? rating?.attack_elo : rating?.defense_elo) ?? 1000);
      }, 0) / members.length,
    );
  const redElo = average(args.red);
  const blueElo = average(args.blue);
  const expectedRed = 1 / (1 + 10 ** ((blueElo - redElo) / 400));
  const redWon = args.redScore > args.blueScore;
  const delta = Math.max(1, Math.abs(Math.round(32 * ((redWon ? 1 : 0) - expectedRed))));
  const signedDelta = redWon ? delta : -delta;
  const id = crypto.randomUUID();
  const now = Date.now();

  const statements = [
    db
      .prepare(
        "INSERT INTO matches (id, red_score, blue_score, red_elo_before, blue_elo_before, elo_delta, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(id, args.redScore, args.blueScore, redElo, blueElo, Math.abs(signedDelta), args.createdBy, now),
    ...args.red.map((member) =>
      db.prepare("INSERT INTO match_players (match_id, player_id, side, position) VALUES (?, ?, 'red', ?)").bind(id, member.id, member.position),
    ),
    ...args.blue.map((member) =>
      db.prepare("INSERT INTO match_players (match_id, player_id, side, position) VALUES (?, ?, 'blue', ?)").bind(id, member.id, member.position),
    ),
    ...args.red.map((member) => updatePlayerRating(db, member, signedDelta, redWon)),
    ...args.blue.map((member) => updatePlayerRating(db, member, -signedDelta, !redWon)),
  ];
  await db.batch(statements);
  return { id, delta: Math.abs(signedDelta) };
}

function updatePlayerRating(db: D1Database, member: MatchMember, delta: number, won: boolean) {
  const roleColumn = member.position === "attaquant" ? "attack_elo" : "defense_elo";
  return db
    .prepare(
      `UPDATE players SET elo = elo + ?, ${roleColumn} = ${roleColumn} + ?, games = games + 1, wins = wins + ?, losses = losses + ? WHERE id = ?`,
    )
    .bind(delta, delta, won ? 1 : 0, won ? 0 : 1, member.id);
}

type TournamentPlayerRow = {
  id: string;
  name: string;
  elo: number;
  attack_elo: number;
  defense_elo: number;
  joined_round: number;
  left_round: number | null;
};

type TournamentMatchRow = {
  id: string;
  tournament_id: string;
  round_number: number;
  status: "pending" | "recording" | "completed";
  red_score: number | null;
  blue_score: number | null;
  match_id: string | null;
  created_at: number;
  completed_at: number | null;
};

function tournamentPositions(players: TournamentPlayerRow[]): MatchMember[] {
  if (players.length === 1) {
    const player = players[0];
    return [{ id: player.id, position: player.defense_elo > player.attack_elo ? "defenseur" : "attaquant" }];
  }
  const [first, second] = players;
  const firstDefends = first.defense_elo + second.attack_elo >= first.attack_elo + second.defense_elo;
  return [
    { id: first.id, position: firstDefends ? "defenseur" : "attaquant" },
    { id: second.id, position: firstDefends ? "attaquant" : "defenseur" },
  ];
}

function tournamentRating(players: TournamentPlayerRow[], members: MatchMember[]) {
  return members.reduce((sum, member) => {
    const player = players.find((item) => item.id === member.id)!;
    return sum + (member.position === "attaquant" ? player.attack_elo : player.defense_elo);
  }, 0) / members.length;
}

function balanceTournamentGroup(group: TournamentPlayerRow[]) {
  const partitions: Array<[TournamentPlayerRow[], TournamentPlayerRow[]]> = [];
  if (group.length === 2) partitions.push([[group[0]], [group[1]]]);
  if (group.length === 3) {
    group.forEach((solo) => partitions.push([group.filter((player) => player.id !== solo.id), [solo]]));
  }
  if (group.length === 4) {
    for (let index = 1; index < group.length; index++) {
      partitions.push([[group[0], group[index]], group.filter((_, itemIndex) => itemIndex !== 0 && itemIndex !== index)]);
    }
  }
  const options = partitions.map(([redPlayers, bluePlayers]) => {
    const red = tournamentPositions(redPlayers);
    const blue = tournamentPositions(bluePlayers);
    return { red, blue, gap: Math.abs(tournamentRating(group, red) - tournamentRating(group, blue)) + Math.random() * 8 };
  }).sort((first, second) => first.gap - second.gap);
  const best = options[0];
  return Math.random() > .5 ? { red: best.blue, blue: best.red } : { red: best.red, blue: best.blue };
}

async function createTournamentRound(db: D1Database, tournamentId: string, roundNumber: number) {
  const result = await db
    .prepare(
      `SELECT p.id, p.name, p.elo, p.attack_elo, p.defense_elo, tp.joined_round, tp.left_round
       FROM tournament_players tp JOIN players p ON p.id = tp.player_id
       WHERE tp.tournament_id = ? AND tp.joined_round <= ? AND (tp.left_round IS NULL OR tp.left_round > ?)`,
    )
    .bind(tournamentId, roundNumber, roundNumber)
    .all<TournamentPlayerRow>();
  if (result.results.length < 2) throw new Error("Il faut au moins deux participants pour lancer un tour.");
  const shuffled = [...result.results].sort(() => Math.random() - .5);
  const groups: TournamentPlayerRow[][] = [];
  while (shuffled.length) {
    const size = shuffled.length === 5 ? 3 : Math.min(4, shuffled.length);
    groups.push(shuffled.splice(0, size));
  }
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  for (const group of groups) {
    const id = crypto.randomUUID();
    const teams = balanceTournamentGroup(group);
    statements.push(
      db.prepare("INSERT INTO tournament_matches (id, tournament_id, round_number, status, created_at) VALUES (?, ?, ?, 'pending', ?)").bind(id, tournamentId, roundNumber, now),
      ...teams.red.map((member) => db.prepare("INSERT INTO tournament_match_players (tournament_match_id, player_id, side, position) VALUES (?, ?, 'red', ?)").bind(id, member.id, member.position)),
      ...teams.blue.map((member) => db.prepare("INSERT INTO tournament_match_players (tournament_match_id, player_id, side, position) VALUES (?, ?, 'blue', ?)").bind(id, member.id, member.position)),
    );
  }
  await db.batch(statements);
}

export async function createTournament(name: string, playerIds: string[], createdBy: string) {
  const cleanName = name.trim().replace(/\s+/g, " ");
  const uniqueIds = [...new Set(playerIds)];
  if (cleanName.length < 2 || cleanName.length > 50) throw new Error("Le nom du tournoi doit contenir entre 2 et 50 caractères.");
  if (uniqueIds.length < 2) throw new Error("Sélectionnez au moins deux participants.");
  const db = d1();
  const placeholders = uniqueIds.map(() => "?").join(",");
  const found = await db.prepare(`SELECT id FROM players WHERE id IN (${placeholders})`).bind(...uniqueIds).all<{ id: string }>();
  if (found.results.length !== uniqueIds.length) throw new Error("Un participant est introuvable.");
  const active = await db.prepare("SELECT id FROM tournaments WHERE status = 'active' LIMIT 1").first();
  if (active) throw new Error("Terminez le tournoi en cours avant d’en créer un nouveau.");
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO tournaments (id, name, status, current_round, created_by, created_at) VALUES (?, ?, 'active', 1, ?, ?)").bind(id, cleanName, createdBy, now),
    ...uniqueIds.map((playerId) => db.prepare("INSERT INTO tournament_players (tournament_id, player_id, joined_round, created_at) VALUES (?, ?, 1, ?)").bind(id, playerId, now)),
  ]);
  await createTournamentRound(db, id, 1);
  return getTournament(id);
}

export async function getTournaments() {
  const result = await d1()
    .prepare(
      `SELECT t.*,
         (SELECT COUNT(*) FROM tournament_players tp WHERE tp.tournament_id = t.id) AS player_count,
         (SELECT COUNT(*) FROM tournament_matches tm WHERE tm.tournament_id = t.id AND tm.status = 'completed') AS completed_matches,
         (SELECT COUNT(*) FROM tournament_matches tm WHERE tm.tournament_id = t.id) AS match_count
       FROM tournaments t ORDER BY CASE WHEN t.status = 'active' THEN 0 ELSE 1 END, t.created_at DESC LIMIT 20`,
    )
    .all();
  return result.results;
}

export async function getTournament(id: string) {
  const db = d1();
  const tournament = await db.prepare("SELECT * FROM tournaments WHERE id = ? LIMIT 1").bind(id).first();
  if (!tournament) throw new Error("Ce tournoi est introuvable.");
  const playerResult = await db
    .prepare(
      `SELECT p.id, p.name, p.elo, p.attack_elo, p.defense_elo, tp.joined_round, tp.left_round
       FROM tournament_players tp JOIN players p ON p.id = tp.player_id
       WHERE tp.tournament_id = ? ORDER BY tp.created_at ASC`,
    )
    .bind(id)
    .all<TournamentPlayerRow>();
  const matchResult = await db.prepare("SELECT * FROM tournament_matches WHERE tournament_id = ? ORDER BY round_number DESC, created_at ASC").bind(id).all<TournamentMatchRow>();
  const memberResult = await db
    .prepare(
      `SELECT tmp.tournament_match_id, tmp.side, tmp.position, p.id, p.name
       FROM tournament_match_players tmp JOIN players p ON p.id = tmp.player_id
       WHERE tmp.tournament_match_id IN (SELECT id FROM tournament_matches WHERE tournament_id = ?)
       ORDER BY tmp.side, tmp.position`,
    )
    .bind(id)
    .all();
  const members = memberResult.results as Array<Record<string, unknown>>;
  const matches = matchResult.results.map((match) => ({
    ...match,
    red: members.filter((member) => member.tournament_match_id === match.id && member.side === "red"),
    blue: members.filter((member) => member.tournament_match_id === match.id && member.side === "blue"),
  }));
  const standings = playerResult.results.map((player) => {
    let played = 0; let wins = 0; let losses = 0; let goalsFor = 0; let goalsAgainst = 0;
    for (const match of matches.filter((item) => item.status === "completed")) {
      const side = match.red.some((member) => member.id === player.id) ? "red" : match.blue.some((member) => member.id === player.id) ? "blue" : null;
      if (!side) continue;
      const own = side === "red" ? match.red_score! : match.blue_score!;
      const other = side === "red" ? match.blue_score! : match.red_score!;
      played += 1; goalsFor += own; goalsAgainst += other;
      if (own > other) wins += 1; else losses += 1;
    }
    return { ...player, played, wins, losses, points: wins * 3, goal_diff: goalsFor - goalsAgainst };
  }).sort((first, second) => second.points - first.points || second.wins - first.wins || second.goal_diff - first.goal_diff || second.elo - first.elo);
  return { tournament, players: playerResult.results, standings, matches };
}

export async function addTournamentPlayer(tournamentId: string, playerId: string) {
  const db = d1();
  const tournament = await db.prepare("SELECT status, current_round FROM tournaments WHERE id = ? LIMIT 1").bind(tournamentId).first<{ status: string; current_round: number }>();
  if (!tournament || tournament.status !== "active") throw new Error("Ce tournoi n’accepte plus de participants.");
  const player = await db.prepare("SELECT id FROM players WHERE id = ? LIMIT 1").bind(playerId).first();
  if (!player) throw new Error("Ce joueur est introuvable.");
  const existing = await db.prepare("SELECT joined_round, left_round FROM tournament_players WHERE tournament_id = ? AND player_id = ? LIMIT 1").bind(tournamentId, playerId).first<{ joined_round: number; left_round: number | null }>();
  if (existing) {
    if (existing.left_round === null || existing.left_round > tournament.current_round) throw new Error("Ce joueur participe déjà au tournoi.");
    await db.prepare("UPDATE tournament_players SET joined_round = ?, left_round = NULL, created_at = ? WHERE tournament_id = ? AND player_id = ?").bind(tournament.current_round + 1, Date.now(), tournamentId, playerId).run();
    return getTournament(tournamentId);
  }
  try {
    await db.prepare("INSERT INTO tournament_players (tournament_id, player_id, joined_round, created_at) VALUES (?, ?, ?, ?)").bind(tournamentId, playerId, tournament.current_round + 1, Date.now()).run();
  } catch {
    throw new Error("Ce joueur participe déjà au tournoi.");
  }
  return getTournament(tournamentId);
}

export async function removeTournamentPlayer(tournamentId: string, playerId: string) {
  const db = d1();
  const tournament = await db.prepare("SELECT status, current_round FROM tournaments WHERE id = ? LIMIT 1").bind(tournamentId).first<{ status: string; current_round: number }>();
  if (!tournament || tournament.status !== "active") throw new Error("Ce tournoi ne peut plus être modifié.");
  const participant = await db.prepare("SELECT joined_round, left_round FROM tournament_players WHERE tournament_id = ? AND player_id = ? LIMIT 1").bind(tournamentId, playerId).first<{ joined_round: number; left_round: number | null }>();
  if (!participant) throw new Error("Ce joueur ne participe pas à ce tournoi.");
  if (participant.left_round !== null && participant.left_round > tournament.current_round) throw new Error("Le départ de ce joueur est déjà prévu.");
  if (participant.joined_round > tournament.current_round) {
    await db.prepare("DELETE FROM tournament_players WHERE tournament_id = ? AND player_id = ?").bind(tournamentId, playerId).run();
  } else {
    await db.prepare("UPDATE tournament_players SET left_round = ? WHERE tournament_id = ? AND player_id = ?").bind(tournament.current_round + 1, tournamentId, playerId).run();
  }
  return getTournament(tournamentId);
}

export async function createNextTournamentRound(tournamentId: string) {
  const db = d1();
  const tournament = await db.prepare("SELECT status, current_round FROM tournaments WHERE id = ? LIMIT 1").bind(tournamentId).first<{ status: string; current_round: number }>();
  if (!tournament || tournament.status !== "active") throw new Error("Ce tournoi est terminé.");
  const pending = await db.prepare("SELECT COUNT(*) AS count FROM tournament_matches WHERE tournament_id = ? AND round_number = ? AND status != 'completed'").bind(tournamentId, tournament.current_round).first<{ count: number }>();
  if ((pending?.count ?? 0) > 0) throw new Error("Terminez tous les matchs du tour avant de continuer.");
  const nextRound = tournament.current_round + 1;
  await createTournamentRound(db, tournamentId, nextRound);
  await db.prepare("UPDATE tournaments SET current_round = ? WHERE id = ?").bind(nextRound, tournamentId).run();
  return getTournament(tournamentId);
}

export async function recordTournamentMatch(tournamentId: string, tournamentMatchId: string, redScore: number, blueScore: number, createdBy: string) {
  if (!Number.isInteger(redScore) || !Number.isInteger(blueScore) || redScore < 0 || blueScore < 0 || redScore > 99 || blueScore > 99 || redScore === blueScore) {
    throw new Error("Saisissez un score valide, sans égalité.");
  }
  const db = d1();
  const now = Date.now();
  const staleBefore = now - 60_000;
  const row = await db
    .prepare("SELECT tm.id FROM tournament_matches tm JOIN tournaments t ON t.id = tm.tournament_id WHERE tm.id = ? AND tm.tournament_id = ? AND (tm.status = 'pending' OR (tm.status = 'recording' AND tm.completed_at < ?)) AND t.status = 'active' LIMIT 1")
    .bind(tournamentMatchId, tournamentId, staleBefore)
    .first();
  if (!row) throw new Error("Ce match a déjà été enregistré ou n’est plus disponible.");
  const members = await db.prepare("SELECT player_id AS id, side, position FROM tournament_match_players WHERE tournament_match_id = ?").bind(tournamentMatchId).all<{ id: string; side: Side; position: Position }>();
  const locked = await db.prepare("UPDATE tournament_matches SET status = 'recording', completed_at = ? WHERE id = ? AND (status = 'pending' OR (status = 'recording' AND completed_at < ?))").bind(now, tournamentMatchId, staleBefore).run();
  if ((locked.meta.changes ?? 0) !== 1) throw new Error("Ce match vient d’être enregistré par un autre collègue.");
  try {
    const match = await addMatch({
      red: members.results.filter((member) => member.side === "red").map(({ id, position }) => ({ id, position })),
      blue: members.results.filter((member) => member.side === "blue").map(({ id, position }) => ({ id, position })),
      redScore,
      blueScore,
      createdBy,
    });
    await db.prepare("UPDATE tournament_matches SET status = 'completed', red_score = ?, blue_score = ?, match_id = ?, completed_at = ? WHERE id = ?").bind(redScore, blueScore, match.id, Date.now(), tournamentMatchId).run();
    return getTournament(tournamentId);
  } catch (error) {
    await db.prepare("UPDATE tournament_matches SET status = 'pending', completed_at = NULL WHERE id = ? AND status = 'recording'").bind(tournamentMatchId).run();
    throw error;
  }
}

export async function finishTournament(tournamentId: string) {
  const db = d1();
  const pending = await db.prepare("SELECT COUNT(*) AS count FROM tournament_matches WHERE tournament_id = ? AND status != 'completed'").bind(tournamentId).first<{ count: number }>();
  if ((pending?.count ?? 0) > 0) throw new Error("Terminez les matchs en cours avant de clôturer le tournoi.");
  const result = await db.prepare("UPDATE tournaments SET status = 'completed', completed_at = ? WHERE id = ? AND status = 'active'").bind(Date.now(), tournamentId).run();
  if ((result.meta.changes ?? 0) !== 1) throw new Error("Ce tournoi est déjà terminé.");
  return getTournament(tournamentId);
}

export async function seedDemoData() {
  const db = d1();
  const count = await db.prepare("SELECT COUNT(*) AS count FROM players").first<{ count: number }>();
  if ((count?.count ?? 0) > 1) return;
  const now = Date.now();
  const demoPlayers = [
    ["demo-camille", "Camille", "attaquant", 1184, 1218, 1050, 14, 7, 21],
    ["demo-thomas", "Thomas", "defenseur", 1126, 1018, 1172, 11, 8, 19],
    ["demo-sofia", "Sofia", "polyvalent", 1068, 1062, 1075, 9, 9, 18],
    ["demo-hugo", "Hugo", "attaquant", 1012, 1048, 972, 7, 10, 17],
    ["demo-lea", "Léa", "defenseur", 986, 940, 1038, 6, 11, 17],
  ] as const;
  await db.batch(
    demoPlayers.map((p, index) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO players (id, email, name, preferred_position, elo, attack_elo, defense_elo, wins, losses, games, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], now - index * 1000),
    ),
  );
  const matchCount = await db.prepare("SELECT COUNT(*) AS count FROM matches").first<{ count: number }>();
  if ((matchCount?.count ?? 0) > 0) return;
  const demoMatches = [
    { id: "demo-match-1", red: [["demo-camille", "attaquant"], ["demo-thomas", "defenseur"]], blue: [["demo-sofia", "attaquant"], ["demo-hugo", "defenseur"]], score: [10, 7], ago: 28 * 60_000 },
    { id: "demo-match-2", red: [["demo-lea", "defenseur"]], blue: [["demo-hugo", "attaquant"]], score: [6, 10], ago: 3 * 3_600_000 },
    { id: "demo-match-3", red: [["demo-sofia", "defenseur"], ["demo-hugo", "attaquant"]], blue: [["demo-camille", "attaquant"]], score: [8, 10], ago: 25 * 3_600_000 },
  ] as const;
  for (const item of demoMatches) {
    await db.batch([
      db.prepare("INSERT INTO matches (id, red_score, blue_score, red_elo_before, blue_elo_before, elo_delta, created_by, created_at) VALUES (?, ?, ?, 1080, 1060, 15, 'demo@buroball.local', ?)").bind(item.id, item.score[0], item.score[1], now - item.ago),
      ...item.red.map((p) => db.prepare("INSERT INTO match_players (match_id, player_id, side, position) VALUES (?, ?, 'red', ?)").bind(item.id, p[0], p[1])),
      ...item.blue.map((p) => db.prepare("INSERT INTO match_players (match_id, player_id, side, position) VALUES (?, ?, 'blue', ?)").bind(item.id, p[0], p[1])),
    ]);
  }
}
