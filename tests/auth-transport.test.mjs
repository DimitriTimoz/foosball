import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authScreen = readFileSync(new URL("../app/auth-screen.tsx", import.meta.url), "utf8");
const appScreen = readFileSync(new URL("../app/buroball-app.tsx", import.meta.url), "utf8");
const loginRoute = readFileSync(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8");
const registerRoute = readFileSync(new URL("../app/api/auth/register/route.ts", import.meta.url), "utf8");
const passwordRoute = readFileSync(new URL("../app/api/auth/password/route.ts", import.meta.url), "utf8");

test("the authentication form can never fall back to a GET submission", () => {
  assert.match(authScreen, /<form[^>]+method="post"[^>]+action=\{`\/api\/auth\/\$\{mode\}`\}/);
  assert.match(authScreen, /method:\s*"POST"/);
  assert.match(authScreen, /type="password"/);
  assert.match(appScreen, /method="post" action="\/api\/auth\/password"/);
});

test("authentication endpoints accept safe POST form fallbacks", () => {
  for (const route of [loginRoute, registerRoute, passwordRoute]) {
    assert.match(route, /export async function POST/);
    assert.match(route, /request\.formData\(\)/);
    assert.match(route, /"Referrer-Policy":\s*"no-referrer"/);
    assert.doesNotMatch(route, /export async function GET/);
  }
});

test("sensitive query parameters are removed from an already contaminated URL", () => {
  for (const key of ["password", "confirmPassword", "username", "name"]) assert.ok(authScreen.includes(`"${key}"`));
  assert.match(authScreen, /window\.history\.replaceState/);
});
