import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const admin = readFileSync(new URL("../admin.html", import.meta.url), "utf8");

test("admin offers an explicit visible game-count selector", () => {
  assert.match(admin, /Games visible at once/);
  assert.match(admin, /<select id="maxRows">/);
  assert.match(admin, /<option value="1">1 game<\/option>/);
  assert.match(admin, /<option value="5" selected>5 games<\/option>/);
  assert.doesNotMatch(admin, /<option value="6">/);
  assert.match(admin, /Includes any pinned match; extra games scroll continuously/);
});

test("changing the visible game count refreshes the embedded preview", () => {
  assert.match(admin, /query\.set\("max",document\.getElementById\("maxRows"\)\.value\|\|"5"\)/);
  assert.match(admin, /getElementById\("maxRows"\)\.addEventListener\("change",refreshPreview\)/);
});
