import { createAccountSession, initializeDatabase, registerAccount } from "@/db/foosball";
import { createSessionCookie, isSecureRequest } from "@/lib/auth-session";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { username?: string; password?: string; name?: string; invitationToken?: string | null };
    await initializeDatabase();
    const account = await registerAccount({
      username: body.username ?? "",
      password: body.password ?? "",
      name: body.name ?? "",
      invitationToken: body.invitationToken,
    });
    const token = await createAccountSession(account.id);
    return Response.json(
      { registered: true },
      { status: 201, headers: { "Set-Cookie": createSessionCookie(token, isSecureRequest(request)), "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to create the account." }, { status: 400 });
  }
}
