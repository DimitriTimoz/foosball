import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createRematchDraft } from "../lib/match-entry.ts";

test("a rematch keeps the lineup but requires a fresh score", () => {
  const previous = {
    red: [{ id: "alice", position: "attaquant" }],
    blue: [{ id: "bob", position: "defenseur" }],
  };

  assert.deepEqual(createRematchDraft(previous), {
    red: previous.red,
    blue: previous.blue,
    redScore: 0,
    blueScore: 0,
  });
});

test("match submission has a synchronous duplicate guard", () => {
  const source = readFileSync(new URL("../app/buroball-app.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(matchSubmissionLocked\.current\) return;/);
  assert.match(source, /matchSubmissionLocked\.current = true;/);
  assert.match(source, /matchSubmissionLocked\.current = false;/);
});
