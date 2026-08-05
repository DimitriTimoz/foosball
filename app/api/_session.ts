import { getAccountSession, getPlayerById, initializeDatabase } from "@/db/foosball";
import { readSessionToken } from "@/lib/auth-session";

export async function getSession() {
  if (process.env.NODE_ENV !== "production" || process.env.BUROBALL_DEMO_MODE === "true") {
    return {
      displayName: "Alex",
      username: "alex",
      playerId: "demo-camille",
      accountId: "demo-account",
      isDemo: true,
    };
  }
  await initializeDatabase();
  const token = await readSessionToken();
  if (!token) return null;
  const account = await getAccountSession(token);
  if (!account) return null;
  return {
    displayName: account.name,
    username: account.username,
    playerId: account.player_id,
    accountId: account.account_id,
    isDemo: false,
  };
}

export async function getMemberSession() {
  const user = await getSession();
  if (!user) return null;
  await initializeDatabase();
  const player = await getPlayerById(user.playerId);
  return player ? { user, player } : null;
}
