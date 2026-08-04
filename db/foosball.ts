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
  "CREATE INDEX IF NOT EXISTS matches_created_at_idx ON matches (created_at DESC)",
  "CREATE INDEX IF NOT EXISTS match_players_player_idx ON match_players (player_id)",
];

function d1() {
  if (!env.DB) throw new Error("La base de données n’est pas disponible.");
  return env.DB as D1Database;
}

export async function initializeDatabase() {
  const db = d1();
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
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
    .prepare(`SELECT id, elo FROM players WHERE id IN (${placeholders})`)
    .bind(...playerIds)
    .all();
  if (rows.results.length !== playerIds.length) throw new Error("Un joueur est introuvable.");
  const ratings = new Map((rows.results as Array<{ id: string; elo: number }>).map((row) => [row.id, row.elo]));
  const average = (members: MatchMember[]) =>
    Math.round(members.reduce((sum, member) => sum + (ratings.get(member.id) ?? 1000), 0) / members.length);
  const redElo = average(args.red);
  const blueElo = average(args.blue);
  const expectedRed = 1 / (1 + 10 ** ((blueElo - redElo) / 400));
  const redWon = args.redScore > args.blueScore;
  const delta = Math.max(1, Math.round(32 * ((redWon ? 1 : 0) - expectedRed)));
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
    ...args.red.map((member) =>
      db
        .prepare("UPDATE players SET elo = elo + ?, games = games + 1, wins = wins + ?, losses = losses + ? WHERE id = ?")
        .bind(signedDelta, redWon ? 1 : 0, redWon ? 0 : 1, member.id),
    ),
    ...args.blue.map((member) =>
      db
        .prepare("UPDATE players SET elo = elo - ?, games = games + 1, wins = wins + ?, losses = losses + ? WHERE id = ?")
        .bind(signedDelta, redWon ? 0 : 1, redWon ? 1 : 0, member.id),
    ),
  ];
  await db.batch(statements);
  return { id, delta: Math.abs(signedDelta) };
}

export async function seedDemoData() {
  const db = d1();
  const count = await db.prepare("SELECT COUNT(*) AS count FROM players").first<{ count: number }>();
  if ((count?.count ?? 0) > 1) return;
  const now = Date.now();
  const demoPlayers = [
    ["demo-camille", "Camille", "attaquant", 1184, 14, 7, 21],
    ["demo-thomas", "Thomas", "defenseur", 1126, 11, 8, 19],
    ["demo-sofia", "Sofia", "polyvalent", 1068, 9, 9, 18],
    ["demo-hugo", "Hugo", "attaquant", 1012, 7, 10, 17],
    ["demo-lea", "Léa", "defenseur", 986, 6, 11, 17],
  ] as const;
  await db.batch(
    demoPlayers.map((p, index) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO players (id, email, name, preferred_position, elo, wins, losses, games, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(p[0], p[1], p[2], p[3], p[4], p[5], p[6], now - index * 1000),
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
