import { authenticateAccount, createAccountSession, initializeDatabase } from "@/db/foosball";
import { createSessionCookie, isSecureRequest } from "@/lib/auth-session";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { username?: string; password?: string };
    await initializeDatabase();
    const account = await authenticateAccount(body.username ?? "", body.password ?? "");
    const token = await createAccountSession(account.id);
    return Response.json(
      { signedIn: true },
      { headers: { "Set-Cookie": createSessionCookie(token, isSecureRequest(request)), "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to sign in." }, { status: 401 });
  }
}
