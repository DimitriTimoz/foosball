import { ensureInitialMember, getDashboard, getPlayerByEmail, initializeDatabase, seedDemoData } from "@/db/foosball";
import { getSession } from "../_session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSession();
  if (!user) return Response.json({ error: "Sign-in required." }, { status: 401 });
  await initializeDatabase();
  let player = await getPlayerByEmail(user.email);
  if (!player) player = await ensureInitialMember(user.email, user.fullName ?? user.displayName);
  if (!player) {
    return Response.json(
      { error: "An invitation is required to join this league.", code: "invite_required" },
      { status: 403 },
    );
  }
  if (user.isDemo) await seedDemoData();
  const dashboard = await getDashboard();
  return Response.json({ ...dashboard, user });
}
