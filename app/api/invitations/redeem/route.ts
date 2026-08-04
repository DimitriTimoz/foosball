import { initializeDatabase, redeemInvitation } from "@/db/foosball";
import { getSession } from "../../_session";

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return Response.json({ error: "Sign-in required." }, { status: 401 });
  const body = (await request.json()) as { token?: string };
  try {
    await initializeDatabase();
    await redeemInvitation(body.token ?? "", user.email, user.fullName ?? user.displayName);
    return Response.json({ joined: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to use this invitation." },
      { status: 400 },
    );
  }
}
