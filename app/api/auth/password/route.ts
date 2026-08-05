import { changeAccountPassword, createAccountSession } from "@/db/foosball";
import { createSessionCookie, isSecureRequest } from "@/lib/auth-session";
import { getSession } from "../../_session";

export async function POST(request: Request) {
  const user = await getSession();
  if (!user || user.isDemo) return Response.json({ error: "Authentication required." }, { status: 401 });
  const isJson = request.headers.get("content-type")?.includes("application/json") ?? false;
  try {
    const body = isJson
      ? await request.json() as { currentPassword?: string; newPassword?: string }
      : Object.fromEntries(await request.formData()) as { currentPassword?: string; newPassword?: string };
    await changeAccountPassword(user.accountId, body.currentPassword ?? "", body.newPassword ?? "");
    const token = await createAccountSession(user.accountId);
    const headers = { "Set-Cookie": createSessionCookie(token, isSecureRequest(request)), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
    return isJson ? Response.json({ changed: true }, { headers }) : new Response(null, { status: 303, headers: { ...headers, Location: "/" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to change the password." },
      { status: 400, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } },
    );
  }
}
