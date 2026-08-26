import test from "node:test";
import assert from "node:assert/strict";
import { COMPETITIONS, DEFAULT_SETTINGS, resolveCompetition, sanitiseSettings } from "../netlify/functions/_shared/catalog.js";

test("legacy competition codes still resolve", () => {
  assert.equal(resolveCompetition("PL")?.id, "pl");
  assert.equal(resolveCompetition("CL")?.id, "champions-league");
  assert.equal(resolveCompetition("EC")?.id, "euros");
  assert.equal(resolveCompetition("WC")?.id, "world-cup");
});

test("all Newcastle and England competitions are enabled by default", () => {
  assert.deepEqual(DEFAULT_SETTINGS.competitions, COMPETITIONS.map(({ id }) => id));
});

test("saved settings are constrained to safe display values", () => {
  const settings = sanitiseSettings({ sourceMode:"unknown", competitions:["PL","league-cup","not-real"], maxRows:99, maxBoards:9, preMinutes:-5, postMinutes:9999, showCompetitionLogo:false, highlightTeams:["Newcastle","England"] });
  assert.equal(settings.sourceMode, "hybrid");
  assert.deepEqual(settings.competitions, ["pl", "league-cup"]);
  assert.equal(settings.maxRows, 8);
  assert.equal(settings.maxBoards, 2);
  assert.equal(settings.preMinutes, 0);
  assert.equal(settings.postMinutes, 720);
  assert.equal(settings.showCompetitionLogo, false);
});
