import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

test("the main stylesheet has a stable deployment URL", () => {
  assert.match(viteConfig, /assets\/office-foos\.css/);
  if (existsSync(new URL("../dist/client/assets/office-foos.css", import.meta.url))) {
    const css = readFileSync(new URL("../dist/client/assets/office-foos.css", import.meta.url), "utf8");
    assert.ok(css.length > 20_000, "the generated stylesheet should contain the application styles");
  }
});
