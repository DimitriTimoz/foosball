import { cookies } from "next/headers";

export const SESSION_COOKIE = "office_foos_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

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
