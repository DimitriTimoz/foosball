import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getPlayerByEmail, initializeDatabase } from "@/db/foosball";

export async function getSession() {
  const user = await getChatGPTUser();
  if (user) return { ...user, isDemo: false };
  if (process.env.NODE_ENV !== "production" || process.env.BUROBALL_DEMO_MODE === "true") {
    return {
      displayName: "Alex",
      fullName: "Alex Martin",
      email: "alex@buroball.local",
      isDemo: true,
    };
  }
  return null;
}

export async function getMemberSession() {
  const user = await getSession();
  if (!user) return null;
  await initializeDatabase();
  const player = await getPlayerByEmail(user.email);
  return player ? { user, player } : null;
}
