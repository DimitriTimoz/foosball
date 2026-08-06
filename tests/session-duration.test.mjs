import assert from "node:assert/strict";
import test from "node:test";

import {
  SESSION_DURATION_DAYS,
  SESSION_MAX_AGE_MS,
  SESSION_MAX_AGE_SECONDS,
} from "../lib/session-duration.ts";

test("account sessions last four months", () => {
  assert.equal(SESSION_DURATION_DAYS, 120);
  assert.equal(SESSION_MAX_AGE_SECONDS, 120 * 24 * 60 * 60);
  assert.equal(SESSION_MAX_AGE_MS, SESSION_MAX_AGE_SECONDS * 1000);
});
