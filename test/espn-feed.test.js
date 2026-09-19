import test from "node:test";
import assert from "node:assert/strict";
import { espnMonthSelectors, fetchEspnWithRetry, recentEspnSnapshot, retainHybridEspnDetails, selectEspnWindowEvents } from "../netlify/functions/_shared/espn-feed.js";
import { resolveCompetition } from "../netlify/functions/_shared/catalog.js";
import { mergeEspnIntoFootballData, normaliseEspn, normaliseFootballData } from "../netlify/functions/_shared/scores-core.js";

test("ESPN month requests cover the existing date window and year boundaries", () => {
  assert.deepEqual(espnMonthSelectors("2026-09-18", "2026-10-19"), ["202609", "202610"]);
  assert.deepEqual(espnMonthSelectors("2026-04-01", "2026-04-30"), ["202603", "202604"]);
  assert.deepEqual(espnMonthSelectors("2026-01-30", "2026-03-01"), ["202601", "202602", "202603"]);
  assert.deepEqual(espnMonthSelectors("2026-12-31", "2027-01-30"), ["202612", "202701"]);
  assert.throws(() => espnMonthSelectors("2026-10-19", "2026-09-18"), /Invalid ESPN date window/);
});

test("ESPN month results are deduplicated and filtered to London calendar dates", () => {
  const boundary = { id: "boundary", date: "2026-03-31T23:30:00Z" }; // April 1 in London
  const selected = selectEspnWindowEvents([
    [{ id: "early", date: "2026-03-31T22:30:00Z" }, boundary],
    [boundary, { id: "late", date: "2026-04-02T00:00:00Z" }],
  ], "2026-04-01", "2026-04-01", 500);
  assert.deepEqual(selected.map(({ id }) => id), ["boundary"]);
});

test("ESPN month results fail visibly if the requested event limit may truncate fixtures", () => {
  const fullBatch = Array.from({ length: 500 }, (_, id) => ({ id, date: "2026-09-19T14:00:00Z" }));
  assert.throws(
    () => selectEspnWindowEvents([fullBatch], "2026-09-18", "2026-10-19", 500),
    /reached its 500-match limit/,
  );
  assert.throws(
    () => selectEspnWindowEvents([null], "2026-09-18", "2026-10-19", 500),
    /invalid event list/,
  );
});

test("ESPN retries a temporary endpoint 400 once but never retries an invalid request", async () => {
  let calls = 0;
  const waits = [];
  const result = await fetchEspnWithRetry(async () => {
    calls += 1;
    if (calls === 1) throw new Error('400: {"code":400,"message":"Failed to get events endpoint."}');
    return { events: ["recovered"] };
  }, async (ms) => waits.push(ms));
  assert.deepEqual(result.events, ["recovered"]);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [350]);

  calls = 0;
  await assert.rejects(fetchEspnWithRetry(async () => {
    calls += 1;
    throw new Error("400: invalid date selector");
  }, async () => assert.fail("should not wait")), /invalid date selector/);
  assert.equal(calls, 1);
});

test("only recent successful hybrid ESPN details can survive a failed refresh", () => {
  const now = new Date("2026-09-19T15:00:00Z");
  const lastGoodEspn = { fetchedAt: "2026-09-19T14:56:00Z", matches: [{ id: "scorer" }] };
  assert.equal(recentEspnSnapshot({ lastGoodEspn, fetchedAt: "2026-09-19T14:59:50Z", matches: [] }, now), lastGoodEspn);
  assert.deepEqual(recentEspnSnapshot({ provider: "football-data+espn", fetchedAt: "2026-09-19T14:59:00Z", matches: [{ id: "legacy" }] }, now)?.matches, [{ id: "legacy" }]);
  assert.equal(recentEspnSnapshot({ lastGoodEspn: { ...lastGoodEspn, fetchedAt: "2026-09-19T14:54:59Z" } }, now), null);
  assert.equal(recentEspnSnapshot({ lastGoodEspn: { ...lastGoodEspn, fetchedAt: "2026-09-19T15:00:10Z" } }, now)?.matches[0].id, "scorer");
  assert.equal(recentEspnSnapshot({ lastGoodEspn: { ...lastGoodEspn, fetchedAt: "2026-09-19T15:01:01Z" } }, now), null);
  assert.equal(recentEspnSnapshot({ provider: "football-data", fetchedAt: now.toISOString(), matches: [] }, now), null);
});

test("repeated failed feed writes cannot erase the independent scorer snapshot", async () => {
  const saved = new Map();
  const writes = [];
  const store = {
    async setJSON(key, value) { saved.set(key, value); writes.push(key); },
    async get(key) { return saved.get(key) || null; },
  };
  const key = "feed:hybrid-last-good:pl";
  const feedKey = "feed:hybrid:pl";
  const match = {
    id: "fd-100", provider: "football-data+espn", sourceId: 100,
    sourceIds: { footballData: 100, espn: "401" },
    status: "IN_PLAY", utcDate: "2026-09-19T14:00:00Z", minute: 35,
    homeTeam: { name: "Newcastle" }, awayTeam: { name: "Hull" },
    score: { fullTime: { home: 1, away: 0 } },
    incidents: { home: { goals: [{ name: "Willock", time: "3'" }], redCards: [] }, away: { goals: [], redCards: [] } },
  };
  const success = { provider: "football-data+espn", matches: [match] };
  await retainHybridEspnDetails(store, key, success, null, new Date("2026-09-19T15:00:00Z"));
  await store.setJSON(feedKey, success);

  for (const minute of [1, 2]) {
    const primary = { ...match, provider: "football-data", minute: 40 + minute,
      score: { fullTime: { home: 2, away: 0 } }, incidents: null };
    const failed = { provider: "football-data", matches: [primary], enrichmentError: "ESPN 400" };
    const previousFeed = await store.get(feedKey);
    await retainHybridEspnDetails(store, key, failed, previousFeed, new Date(`2026-09-19T15:0${minute}:00Z`));
    await store.setJSON(feedKey, failed);
    assert.equal(failed.enrichedCount, 1);
    assert.equal(failed.matches[0].incidents.home.goals[0].name, "Willock");
    assert.deepEqual(failed.matches[0].score.fullTime, { home: 2, away: 0 });
    assert.equal(failed.matches[0].minute, 40 + minute);
  }
  assert.deepEqual(writes, [key, feedKey, feedKey, feedKey]);
  assert.equal((await store.get(key)).matches[0].provider, "football-data+espn");
});

test("ESPN scorer details from a month request still enrich the hybrid score", () => {
  const competition = resolveCompetition("PL");
  const footballData = normaliseFootballData({
    id: 100,
    status: "IN_PLAY",
    utcDate: "2026-09-19T14:00:00Z",
    homeTeam: { id: 67, name: "Newcastle United FC" },
    awayTeam: { id: 64, name: "Hull City AFC" },
    score: { fullTime: { home: 1, away: 0 } },
  }, competition);
  const events = selectEspnWindowEvents([[{
    id: "401",
    date: "2026-09-19T14:00:00Z",
    status: { displayClock: "11'", type: { state: "in", name: "STATUS_IN_PROGRESS" } },
    competitions: [{
      competitors: [
        { homeAway: "home", score: "2", team: { id: "361", displayName: "Newcastle United" } },
        { homeAway: "away", score: "0", team: { id: "364", displayName: "Hull City" } },
      ],
      details: [{
        type: { text: "Goal" },
        clock: { displayValue: "3'" },
        team: { id: "361" },
        scoringPlay: true,
        athletesInvolved: [{ shortName: "J. Willock" }],
      }],
    }],
  }]], "2026-09-18", "2026-10-19", 500);
  const merged = mergeEspnIntoFootballData([footballData], events.map((event) => normaliseEspn(event, competition)));
  assert.equal(merged.enrichedCount, 1);
  assert.deepEqual(merged.matches[0].score.fullTime, { home: 2, away: 0 });
  assert.deepEqual(merged.matches[0].incidents.home.goals, [
    { name: "Willock", time: "3'", ownGoal: false, penalty: false },
  ]);
});
