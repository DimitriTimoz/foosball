import { ensurePlayer, getDashboard, initializeDatabase, seedDemoData } from "@/db/foosball";
import { getSession } from "../_session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSession();
  if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
  await initializeDatabase();
  await ensurePlayer(user.email, user.fullName ?? user.displayName);
  if (user.isDemo) await seedDemoData();
  const dashboard = await getDashboard();
  return Response.json({ ...dashboard, user });
}
