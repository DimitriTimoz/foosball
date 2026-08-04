import { getAccountCount, getDashboard, initializeDatabase, seedDemoData } from "@/db/foosball";
import { getSession } from "../_session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSession();
  if (!user) return Response.json({ error: "Sign-in required." }, { status: 401 });
  await initializeDatabase();
  if (user.isDemo) await seedDemoData();
  const dashboard = await getDashboard();
  return Response.json({ ...dashboard, user, registeredAccounts: user.isDemo ? 1 : await getAccountCount() });
}
