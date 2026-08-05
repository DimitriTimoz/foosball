import { createAccountSession, initializeDatabase, registerAccount } from "@/db/foosball";
import { createSessionCookie, isSecureRequest } from "@/lib/auth-session";

export async function POST(request: Request) {
  const isJson = request.headers.get("content-type")?.includes("application/json") ?? false;
  try {
    const body = isJson
      ? await request.json() as { username?: string; password?: string; name?: string; invitationToken?: string | null }
      : Object.fromEntries(await request.formData()) as { username?: string; password?: string; name?: string; invitationToken?: string | null };
    await initializeDatabase();
    const account = await registerAccount({
      username: body.username ?? "",
      password: body.password ?? "",
      name: body.name ?? "",
      invitationToken: body.invitationToken,
    });
    const token = await createAccountSession(account.id);
    const headers = { "Set-Cookie": createSessionCookie(token, isSecureRequest(request)), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
    return isJson ? Response.json({ registered: true }, { status: 201, headers }) : new Response(null, { status: 303, headers: { ...headers, Location: "/" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create the account.";
    return isJson
      ? Response.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } })
      : new Response("Unable to create the account.", { status: 400, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
  }
}
