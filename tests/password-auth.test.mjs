import assert from "node:assert/strict";
import test from "node:test";
import { hashOpaqueToken, hashPassword, normalizeUsername, validatePassword, validateUsername, verifyPassword } from "../lib/password-auth.ts";

test("usernames are normalized and validated", () => {
  assert.equal(normalizeUsername("  Alex.Martin  "), "alex.martin");
  assert.equal(validateUsername("Team_Player-1"), "team_player-1");
  assert.throws(() => validateUsername("ab"), /3 to 30/);
  assert.throws(() => validateUsername("not allowed"), /letters, numbers/);
});

test("password length requirements are enforced", () => {
  assert.equal(validatePassword("long-enough"), "long-enough");
  assert.throws(() => validatePassword("short"), /10 and 128/);
});

test("password hashes verify the right password only", async () => {
  const encoded = await hashPassword("correct-horse", 1_000);
  assert.match(encoded, /^pbkdf2-sha256\$1000\$/);
  assert.equal(await verifyPassword("correct-horse", encoded), true);
  assert.equal(await verifyPassword("wrong-password", encoded), false);
  assert.equal(await verifyPassword("correct-horse", "malformed"), false);
});

test("opaque session tokens have deterministic hashes", async () => {
  assert.equal(await hashOpaqueToken("session-token"), await hashOpaqueToken("session-token"));
  assert.notEqual(await hashOpaqueToken("session-token"), await hashOpaqueToken("other-token"));
});
