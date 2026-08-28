import test from "node:test";
import assert from "node:assert/strict";
import { resolveCompetition } from "../netlify/functions/_shared/catalog.js";
import { cacheTtlForMatches, compactDisplayMatch, matchesTeamName, mergeEspnIntoFootballData, normaliseEspn, normaliseFootballData, selectDisplayMatches, tidyName } from "../netlify/functions/_shared/scores-core.js";

test("friendly names are provider independent", () => {
  assert.equal(tidyName("Newcastle United FC"), "Newcastle");
  assert.equal(tidyName("Newcastle United"), "Newcastle");
  assert.equal(tidyName("Wolverhampton Wanderers"), "Wolves");
  assert.equal(tidyName("FK Bodø/Glimt"), "Bodo/Glimt");
});

test("ESPN events normalise into the public match shape", () => {
  const match = normaliseEspn({ id:"401", date:"2026-08-26T19:00:00Z", status:{ displayClock:"67'", period:2, type:{ state:"in", name:"STATUS_IN_PROGRESS" } }, competitions:[{ competitors:[{ homeAway:"home", score:"2", team:{ id:"361", displayName:"Newcastle United" } },{ homeAway:"away", score:"1", team:{ id:"364", displayName:"Liverpool" } }], details:[
    { type:{ id:"70", text:"Goal" }, clock:{ displayValue:"25'" }, team:{ id:"361" }, scoringPlay:true, athletesInvolved:[{ shortName:"D. Burn" }] },
    { type:{ id:"70", text:"Goal" }, clock:{ displayValue:"28'" }, team:{ id:"361" }, scoringPlay:true, ownGoal:true, athletesInvolved:[{ displayName:"Yoane Wissa" }] },
    { type:{ id:"70", text:"Goal" }, clock:{ displayValue:"12'" }, team:{ id:"364" }, scoringPlay:true, penaltyKick:true, athletesInvolved:[{ shortName:"R. Giggs" }] },
    { type:{ id:"95", text:"Red Card" }, clock:{ displayValue:"61'" }, team:{ id:"364" }, redCard:true, athletesInvolved:[{ shortName:"A. Player" }] },
  ] }] }, resolveCompetition("PL"));
  assert.equal(match.provider, "espn");
  assert.equal(match.comp, "pl");
  assert.equal(match.status, "IN_PLAY");
  assert.equal(match.minute, 67);
  assert.equal(match.homeTeam.name, "Newcastle");
  assert.deepEqual(match.score.fullTime, { home:2, away:1 });
  assert.deepEqual(match.incidents.home.goals, [
    { name:"Burn", time:"25'", ownGoal:false, penalty:false },
    { name:"Wissa", time:"28'", ownGoal:true, penalty:false },
  ]);
  assert.deepEqual(match.incidents.away.goals, [{ name:"Giggs", time:"12'", ownGoal:false, penalty:true }]);
  assert.deepEqual(match.incidents.away.redCards, [{ name:"Player", time:"61'" }]);
});

test("ESPN penalty shootout totals remain separate from the match score", () => {
  const match = normaliseEspn({ id:"402", date:"2026-08-26T18:45:00Z", status:{ period:5, type:{ state:"in", name:"STATUS_SHOOTOUT" } }, competitions:[{ competitors:[
    { homeAway:"home", score:"0", shootoutScore:4, team:{ id:"387", displayName:"Bradford City" } },
    { homeAway:"away", score:"0", shootoutScore:2, team:{ id:"379", displayName:"Burnley" } },
  ] }] }, resolveCompetition("LC"));
  assert.equal(match.phase, "PENS");
  assert.deepEqual(match.score.fullTime, { home:0, away:0 });
  assert.deepEqual(match.score.penalties, { home:4, away:2 });
});

test("football-data matches retain friendly names", () => {
  const match = normaliseFootballData({ id:100, status:"TIMED", utcDate:"2026-08-26T19:00:00Z", homeTeam:{ id:67, name:"Newcastle United FC" }, awayTeam:{ id:64, name:"Liverpool FC" }, score:{ fullTime:{ home:null, away:null } } }, resolveCompetition("PL"));
  assert.equal(match.homeTeam.name, "Newcastle");
  assert.equal(match.awayTeam.name, "Liverpool");
});

test("team highlighting works by friendly name across providers", () => {
  assert.equal(matchesTeamName({ homeTeam:{ name:"Newcastle" }, awayTeam:{ name:"Liverpool" } }, ["Newcastle"]), true);
});

test("hybrid enrichment merges into one football-data fixture without duplicates", () => {
  const competition = resolveCompetition("PL");
  const footballData = normaliseFootballData({ id:100, status:"IN_PLAY", utcDate:"2026-08-26T19:00:00Z", homeTeam:{ id:67, name:"Newcastle United FC" }, awayTeam:{ id:64, name:"Liverpool FC" }, score:{ fullTime:{ home:1, away:1 } } }, competition);
  const espn = normaliseEspn({ id:"401", date:"2026-08-26T19:00:20Z", status:{ displayClock:"67'", period:2, type:{ state:"in", name:"STATUS_IN_PROGRESS" } }, competitions:[{ competitors:[{ homeAway:"home", score:"2", team:{ id:"361", displayName:"Newcastle United" } },{ homeAway:"away", score:"1", team:{ id:"364", displayName:"Liverpool" } }], details:[{ type:{ text:"Goal" }, clock:{ displayValue:"28'" }, team:{ id:"361" }, scoringPlay:true, athletesInvolved:[{ shortName:"Y. Wissa" }] }] }] }, competition);
  const merged = mergeEspnIntoFootballData([footballData], [espn]);
  assert.equal(merged.matches.length, 1);
  assert.equal(merged.enrichedCount, 1);
  assert.equal(merged.matches[0].id, "fd-100");
  assert.equal(merged.matches[0].provider, "football-data+espn");
  assert.equal(merged.matches[0].minute, 67);
  assert.deepEqual(merged.matches[0].score.fullTime, { home:2, away:1 });
  assert.equal(merged.matches[0].incidents.home.goals[0].name, "Wissa");
});

test("hybrid enrichment ignores an unsafe fixture match", () => {
  const competition = resolveCompetition("PL");
  const footballData = normaliseFootballData({ id:100, status:"TIMED", utcDate:"2026-08-26T19:00:00Z", homeTeam:{ name:"Newcastle United FC" }, awayTeam:{ name:"Liverpool FC" }, score:{} }, competition);
  const unrelated = normaliseEspn({ id:"999", date:"2026-08-26T19:00:00Z", competitions:[{ competitors:[{ homeAway:"home", team:{ displayName:"Everton" } },{ homeAway:"away", team:{ displayName:"Liverpool" } }] }] }, competition);
  const merged = mergeEspnIntoFootballData([footballData], [unrelated]);
  assert.equal(merged.matches.length, 1);
  assert.equal(merged.enrichedCount, 0);
  assert.equal(merged.matches[0].provider, "football-data");
});

test("poll cache ramps up around kickoff", () => {
  const now = new Date("2026-08-26T12:00:00Z");
  assert.equal(cacheTtlForMatches([{ status:"IN_PLAY" }], now), 25_000);
  assert.equal(cacheTtlForMatches([{ status:"TIMED", utcDate:"2026-08-26T11:40:00Z" }], now), 25_000);
  assert.equal(cacheTtlForMatches([{ status:"TIMED", utcDate:"2026-08-26T14:00:00Z" }], now), 60_000);
  assert.equal(cacheTtlForMatches([{ status:"TIMED", utcDate:"2026-08-27T11:00:00Z" }], now), 10*60_000);
  assert.equal(cacheTtlForMatches([], now), 6*60*60_000);
});

test("display payload keeps relevant, overdue and next matches without the broad schedule", () => {
  const now = new Date("2026-08-26T12:00:00Z");
  const settings = { competitions:["pl"], highlightTeams:["Newcastle"], preMinutes:60, postMinutes:120, maxRows:5 };
  const match = (id, status, utcDate) => ({ id, comp:"pl", status, utcDate, score:{ duration:"REGULAR" }, homeTeam:{ name:"Home" }, awayTeam:{ name:"Away" } });
  const matches = [
    match("live", "IN_PLAY", "2026-08-26T11:00:00Z"),
    match("pre", "TIMED", "2026-08-26T12:30:00Z"),
    match("overdue", "TIMED", "2026-08-26T10:00:00Z"),
    match("next", "TIMED", "2026-08-28T12:00:00Z"),
    match("later", "TIMED", "2026-08-29T12:00:00Z"),
    match("old", "FINISHED", "2026-08-25T12:00:00Z"),
  ];
  assert.deepEqual(selectDisplayMatches(matches, settings, now).map(({ id }) => id), ["live", "pre", "overdue", "next"]);
});

test("forced-live display preserves highlighted fallback ordering and row limit", () => {
  const now = new Date("2026-08-26T12:00:00Z");
  const settings = { competitions:["pl"], highlightTeams:["Newcastle"], preMinutes:60, postMinutes:120, maxRows:2 };
  const matches = [
    { id:"soon", comp:"pl", status:"TIMED", utcDate:"2026-08-28T12:00:00Z", homeTeam:{ name:"Everton" }, awayTeam:{ name:"Liverpool" } },
    { id:"highlight", comp:"pl", status:"TIMED", utcDate:"2026-08-30T12:00:00Z", homeTeam:{ name:"Newcastle" }, awayTeam:{ name:"Arsenal" } },
    { id:"later", comp:"pl", status:"TIMED", utcDate:"2026-08-29T12:00:00Z", homeTeam:{ name:"Chelsea" }, awayTeam:{ name:"Fulham" } },
  ];
  assert.deepEqual(selectDisplayMatches(matches, settings, now, true).map(({ id }) => id), ["highlight", "soon"]);
});

test("forced-live display preserves legacy highlighted team-id priority", () => {
  const now = new Date("2026-08-26T12:00:00Z");
  const settings = { competitions:["pl"], highlightTeams:[], preMinutes:60, postMinutes:120, maxRows:1 };
  const matches = [
    { id:"soon", comp:"pl", status:"TIMED", utcDate:"2026-08-27T12:00:00Z", homeTeam:{ id:1, name:"Everton" }, awayTeam:{ id:2, name:"Liverpool" } },
    { id:"legacy", comp:"pl", status:"TIMED", utcDate:"2026-08-29T12:00:00Z", homeTeam:{ id:67, name:"Other" }, awayTeam:{ id:3, name:"Arsenal" } },
  ];
  assert.deepEqual(selectDisplayMatches(matches, settings, now, true, [67]).map(({ id }) => id), ["legacy"]);
});

test("forced-live display retains scheduled fixtures more than four hours overdue", () => {
  const now = new Date("2026-08-26T12:00:00Z");
  const settings = { competitions:["pl"], highlightTeams:[], preMinutes:60, postMinutes:120, maxRows:2 };
  const matches = [
    { id:"overdue", comp:"pl", status:"TIMED", utcDate:"2026-08-26T05:00:00Z", homeTeam:{ name:"Everton" }, awayTeam:{ name:"Liverpool" } },
  ];
  assert.deepEqual(selectDisplayMatches(matches, settings, now, true).map(({ id }) => id), ["overdue"]);
  assert.deepEqual(selectDisplayMatches(matches, settings, now, false), []);
});

test("forced-live display uses browser-equivalent settings highlight semantics", () => {
  const now = new Date("2026-08-26T12:00:00Z");
  const settings = { competitions:["pl"], highlightTeams:["Nott m Forest"], preMinutes:60, postMinutes:120, maxRows:1 };
  const matches = [
    { id:"soon", comp:"pl", status:"TIMED", utcDate:"2026-08-27T12:00:00Z", homeTeam:{ name:"Everton" }, awayTeam:{ name:"Liverpool" } },
    { id:"highlight", comp:"pl", status:"TIMED", utcDate:"2026-08-29T12:00:00Z", homeTeam:{ name:"Nott'm Forest" }, awayTeam:{ name:"Arsenal" } },
  ];
  assert.deepEqual(selectDisplayMatches(matches, settings, now, true).map(({ id }) => id), ["highlight"]);
});

test("forced-live display preserves competition order before kickoff order", () => {
  const now = new Date("2026-08-26T12:00:00Z");
  const settings = { competitions:["cup","pl"], highlightTeams:[], preMinutes:60, postMinutes:120, maxRows:3 };
  const matches = [
    { id:"pl-soon", comp:"pl", status:"TIMED", utcDate:"2026-08-27T12:00:00Z", homeTeam:{ name:"Everton" }, awayTeam:{ name:"Liverpool" } },
    { id:"cup-later", comp:"cup", status:"TIMED", utcDate:"2026-08-28T12:00:00Z", homeTeam:{ name:"Chelsea" }, awayTeam:{ name:"Arsenal" } },
    { id:"cup-soon", comp:"cup", status:"TIMED", utcDate:"2026-08-27T18:00:00Z", homeTeam:{ name:"Leeds" }, awayTeam:{ name:"Sunderland" } },
  ];
  assert.deepEqual(selectDisplayMatches(matches, settings, now, true).map(({ id }) => id), ["cup-soon", "cup-later", "pl-soon"]);
});

test("compact display matches contain renderer fields but omit provider metadata", () => {
  const compact = compactDisplayMatch({ id:"one", sourceId:"upstream", provider:"espn", comp:"pl", competition:{ id:"pl", name:"Premier League", shortName:"Premier League", logo:"/logo.png", sources:{ espn:true } }, status:"IN_PLAY", utcDate:"2026-08-26T12:00:00Z", matchday:3, stage:"league", homeTeam:{ id:1, name:"Newcastle" }, awayTeam:{ id:2, name:"Liverpool" }, score:{ duration:"REGULAR", fullTime:{ home:1, away:0 } }, minute:67, injuryTime:null, phase:null, incidents:{ home:{ goals:[], redCards:[] }, away:{ goals:[], redCards:[] } } });
  assert.equal(compact.provider, undefined);
  assert.equal(compact.matchday, undefined);
  assert.equal(compact.competition.sources, undefined);
  assert.equal(compact.homeTeam.name, "Newcastle");
  assert.deepEqual(compact.score.fullTime, { home:1, away:0 });
});
