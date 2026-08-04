import { deleteAccountSession, initializeDatabase } from "@/db/foosball";
import { clearSessionCookie, isSecureRequest, readSessionToken } from "@/lib/auth-session";

export async function POST(request: Request) {
  await initializeDatabase();
  const token = await readSessionToken();
  if (token) await deleteAccountSession(token);
  return Response.json(
    { signedOut: true },
    { headers: { "Set-Cookie": clearSessionCookie(isSecureRequest(request)), "Cache-Control": "no-store" } },
  );
}
