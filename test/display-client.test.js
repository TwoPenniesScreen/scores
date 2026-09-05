import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function clientHelpers(search = "?preview=one") {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, "public screen script exists");
  const element = () => ({
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
  });
  const elements = new Map();
  const context = vm.createContext({
    URLSearchParams,
    location: { search },
    document: {
      body: element(),
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
    },
    innerWidth: 1920,
    innerHeight: 1080,
    addEventListener() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    requestAnimationFrame(callback) { callback(); return 1; },
    localStorage: { getItem() { return null; }, setItem() {} },
    console,
    Date,
    Intl,
  });
  vm.runInContext(`${script}\nglobalThis.__helpers={mergeFailedCompetitions,boardLayout,continuousScrollMetrics,sampleData};`, context);
  return context.__helpers;
}

test("the embedded preview honours the selected visible game count", () => {
  const { sampleData } = clientHelpers("?preview=one&max=3");
  const data = sampleData(false);
  assert.equal(data.settings.maxRows, 3);
  assert.equal(data.matches.length, 7);
});

test("a highlighted match stays pinned while every other match forms one scrolling list", () => {
  const { boardLayout } = clientHelpers();
  const matches = [
    { id:"pinned", __pin:true },
    { id:"one" }, { id:"two" }, { id:"three" }, { id:"four" }, { id:"five" },
  ];
  const layout = boardLayout(matches, 5);
  assert.equal(layout.pinned.id, "pinned");
  assert.deepEqual(Array.from(layout.unpinned, ({ id }) => id), ["one", "two", "three", "four", "five"]);
  assert.equal(layout.visibleSlots, 4);
  assert.equal(layout.scrolling, true);
});

test("a short non-pinned list remains stationary", () => {
  const { boardLayout } = clientHelpers();
  const layout = boardLayout([{ id:"one" }, { id:"two" }], 5);
  assert.equal(layout.pinned, null);
  assert.equal(layout.visibleSlots, 5);
  assert.equal(layout.scrolling, false);
});

test("the pinned match does not consume the scrolling sequence", () => {
  const { boardLayout } = clientHelpers();
  const pinned = { id:"pinned", __pin:true };
  const layout = boardLayout([{ id:"one" }, pinned, { id:"two" }], 2);
  assert.equal(layout.pinned.id, "pinned");
  assert.deepEqual(Array.from(layout.unpinned, ({ id }) => id), ["one", "two"]);
  assert.equal(layout.visibleSlots, 1);
  assert.equal(layout.scrolling, true);
});

test("scroll measurements use unscaled layout dimensions", () => {
  const { continuousScrollMetrics } = clientHelpers();
  const children = Array.from({ length:5 }, () => ({
    offsetHeight:91,
    getBoundingClientRect() { return { height:45.5 }; },
  }));
  const sequence = { children, offsetHeight:503 };
  const metrics = continuousScrollMetrics(sequence, 4, 12);
  assert.equal(metrics.visibleHeight, 400);
  assert.equal(metrics.distance, 515);
});

test("a failed competition retains its old rows while a healthy live competition updates", () => {
  const { mergeFailedCompetitions } = clientHelpers();
  const previous = { matches:[
    { id:"failed-old", comp:"cup", score:{ fullTime:{ home:1, away:0 } } },
    { id:"healthy-old", comp:"pl", score:{ fullTime:{ home:0, away:0 } } },
  ] };
  const current = {
    matches:[{ id:"healthy-new", comp:"pl", score:{ fullTime:{ home:2, away:1 } } }],
    health:{ competitions:[
      { competition:"cup", error:"provider unavailable", fallback:false, stale:false, usable:false, matchCount:0 },
      { competition:"pl", error:null, fallback:false, stale:false, usable:true, matchCount:1 },
    ] },
  };
  const merged = mergeFailedCompetitions(current, previous);
  assert.deepEqual(Array.from(merged.matches, ({ id }) => id), ["healthy-new", "failed-old"]);
});

test("a valid hybrid fallback updates despite its primary provider error", () => {
  const { mergeFailedCompetitions } = clientHelpers();
  const previous = { matches:[{ id:"old", comp:"pl", score:{ fullTime:{ home:0, away:0 } } }] };
  const current = {
    matches:[{ id:"fallback-new", comp:"pl", score:{ fullTime:{ home:1, away:0 } } }],
    health:{ competitions:[
      { competition:"pl", error:"football-data unavailable", fallback:true, stale:false, usable:true, matchCount:1 },
    ] },
  };
  const merged = mergeFailedCompetitions(current, previous);
  assert.deepEqual(Array.from(merged.matches, ({ id }) => id), ["fallback-new"]);
});

test("a failed refresh does not treat an older fallback source as currently usable", () => {
  const { mergeFailedCompetitions } = clientHelpers();
  const previous = { matches:[{ id:"fallback-old", comp:"pl" }] };
  const current = {
    matches:[],
    health:{ competitions:[
      { competition:"pl", error:"all providers unavailable", fallback:true, stale:false, usable:false, matchCount:0 },
    ] },
  };
  const merged = mergeFailedCompetitions(current, previous);
  assert.deepEqual(Array.from(merged.matches, ({ id }) => id), ["fallback-old"]);
});
