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
  "CREATE INDEX IF NOT EXISTS matches_created_at_idx ON matches (created_at DESC)",
  "CREATE INDEX IF NOT EXISTS match_players_player_idx ON match_players (player_id)",
  "CREATE INDEX IF NOT EXISTS invitations_expires_at_idx ON invitations (expires_at)",
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
    .prepare("SELECT * FROM matches ORDER BY created_at DESC LIMIT 12")
    .all();
  const memberResult = await db
    .prepare(
      `SELECT mp.match_id, mp.side, mp.position, p.id, p.name
       FROM match_players mp JOIN players p ON p.id = mp.player_id
       WHERE mp.match_id IN (SELECT id FROM matches ORDER BY created_at DESC LIMIT 12)
       ORDER BY mp.side, mp.position`,
    )
    .all();

  const members = memberResult.results as Array<Record<string, unknown>>;
  const matches = (matchesResult.results as Array<Record<string, unknown>>).map((match) => ({
    ...match,
    red: members.filter((member) => member.match_id === match.id && member.side === "red"),
    blue: members.filter((member) => member.match_id === match.id && member.side === "blue"),
  }));

  return { players: playersResult.results, matches };
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
