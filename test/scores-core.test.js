import test from "node:test";
import assert from "node:assert/strict";
import { resolveCompetition } from "../netlify/functions/_shared/catalog.js";
import { cacheTtlForMatches, matchesTeamName, normaliseEspn, normaliseFootballData, tidyName } from "../netlify/functions/_shared/scores-core.js";

test("friendly names are provider independent", () => {
  assert.equal(tidyName("Newcastle United FC"), "Newcastle");
  assert.equal(tidyName("Newcastle United"), "Newcastle");
  assert.equal(tidyName("Wolverhampton Wanderers"), "Wolves");
  assert.equal(tidyName("FK Bodø/Glimt"), "Bodo/Glimt");
});

test("ESPN events normalise into the public match shape", () => {
  const match = normaliseEspn({ id:"401", date:"2026-08-26T19:00:00Z", status:{ displayClock:"67'", type:{ state:"in", name:"STATUS_IN_PROGRESS" } }, competitions:[{ competitors:[{ homeAway:"home", score:"2", team:{ id:"361", displayName:"Newcastle United" } },{ homeAway:"away", score:"1", team:{ id:"364", displayName:"Liverpool" } }] }] }, resolveCompetition("PL"));
  assert.equal(match.provider, "espn");
  assert.equal(match.comp, "pl");
  assert.equal(match.status, "IN_PLAY");
  assert.equal(match.minute, 67);
  assert.equal(match.homeTeam.name, "Newcastle");
  assert.deepEqual(match.score.fullTime, { home:2, away:1 });
});

test("football-data matches retain friendly names", () => {
  const match = normaliseFootballData({ id:100, status:"TIMED", utcDate:"2026-08-26T19:00:00Z", homeTeam:{ id:67, name:"Newcastle United FC" }, awayTeam:{ id:64, name:"Liverpool FC" }, score:{ fullTime:{ home:null, away:null } } }, resolveCompetition("PL"));
  assert.equal(match.homeTeam.name, "Newcastle");
  assert.equal(match.awayTeam.name, "Liverpool");
});

test("team highlighting works by friendly name across providers", () => {
  assert.equal(matchesTeamName({ homeTeam:{ name:"Newcastle" }, awayTeam:{ name:"Liverpool" } }, ["Newcastle"]), true);
});

test("poll cache ramps up around kickoff", () => {
  const now = new Date("2026-08-26T12:00:00Z");
  assert.equal(cacheTtlForMatches([{ status:"IN_PLAY" }], now), 25_000);
  assert.equal(cacheTtlForMatches([{ status:"TIMED", utcDate:"2026-08-26T14:00:00Z" }], now), 60_000);
  assert.equal(cacheTtlForMatches([{ status:"TIMED", utcDate:"2026-08-27T11:00:00Z" }], now), 10*60_000);
  assert.equal(cacheTtlForMatches([], now), 6*60*60_000);
});
