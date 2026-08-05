import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const database = readFileSync(new URL("../db/foosball.ts", import.meta.url), "utf8");
const application = readFileSync(new URL("../app/buroball-app.tsx", import.meta.url), "utf8");

test("a valid invitation remains reusable until it expires", () => {
  const registrationBlock = database.slice(
    database.indexOf("export async function registerAccount"),
    database.indexOf("export async function authenticateAccount"),
  );

  assert.match(registrationBlock, /token_hash = \? AND expires_at > \?/);
  assert.doesNotMatch(registrationBlock, /used_at IS NULL/);
  assert.doesNotMatch(registrationBlock, /UPDATE invitations SET used_by/);
});

test("the invitation UI clearly explains multi-account use", () => {
  assert.match(application, /The same link works for everyone for 7 days\./);
  assert.match(application, /Reusable for 7 days/);
});
