import { authenticateAccount, createAccountSession, initializeDatabase } from "@/db/foosball";
import { createSessionCookie, isSecureRequest } from "@/lib/auth-session";

export async function POST(request: Request) {
  const isJson = request.headers.get("content-type")?.includes("application/json") ?? false;
  try {
    const body = isJson
      ? await request.json() as { username?: string; password?: string }
      : Object.fromEntries(await request.formData()) as { username?: string; password?: string };
    await initializeDatabase();
    const account = await authenticateAccount(body.username ?? "", body.password ?? "");
    const token = await createAccountSession(account.id);
    const headers = { "Set-Cookie": createSessionCookie(token, isSecureRequest(request)), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
    return isJson ? Response.json({ signedIn: true }, { headers }) : new Response(null, { status: 303, headers: { ...headers, Location: "/" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sign in.";
    return isJson
      ? Response.json({ error: message }, { status: 401, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } })
      : new Response("Unable to sign in.", { status: 401, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
  }
}
