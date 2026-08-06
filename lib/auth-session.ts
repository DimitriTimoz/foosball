import { cookies } from "next/headers";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/session-duration";

export const SESSION_COOKIE = "office_foos_session";
export { SESSION_MAX_AGE_SECONDS } from "@/lib/session-duration";

export async function readSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export function createSessionCookie(token: string, secure: boolean) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure: boolean) {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function isSecureRequest(request: Request) {
  return new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}
