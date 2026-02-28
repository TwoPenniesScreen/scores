// Netlify Function: /.netlify/functions/scores
// IMPORTANT: set env var FOOTBALL_DATA_API_KEY (or FOOTBALL_DATA_TOKEN) in Netlify.

const API_BASE = "https://api.football-data.org/v4";
const API_KEY =
  process.env.FOOTBALL_DATA_API_KEY ||
  process.env.FOOTBALL_DATA_TOKEN ||
  "";

const BUILD_ID = "scores-v2026-02-28-compact-live-per-comp";

// In-memory cache (warm instances only)
let cache = { ts: 0, key: "", data: null };
const CACHE_MS = 10_000;

// UK-friendly name map
const NAME_MAP = new Map(Object.entries({
  "AFC Bournemouth": "Bournemouth",
  "Manchester United FC": "Man Utd",
  "Manchester City FC": "Man City",
  "Tottenham Hotspur FC": "Spurs",
  "Wolverhampton Wanderers FC": "Wolves",
  "Brighton & Hove Albion FC": "Brighton",
  "Brighton and Hove Albion FC": "Brighton",
  "Newcastle United FC": "Newcastle",
  "West Ham United FC": "West Ham",
  "Nottingham Forest FC": "Nott'm Forest",
  "Crystal Palace FC": "Crystal Palace",
  "Queens Park Rangers FC": "QPR",
  "Sheffield Wednesday FC": "Sheff Wed",
  "Sheffield United FC": "Sheff Utd",
  "West Bromwich Albion FC": "West Brom",
  "Preston North End FC": "Preston",
  "Millwall FC": "Millwall",
  "Leicester City FC": "Leicester",
  "Derby County FC": "Derby",
  "Swansea City AFC": "Swansea",
  "Hull City AFC": "Hull",
  "Coventry City FC": "Coventry",
  "Norwich City FC": "Norwich",
  "Blackburn Rovers FC": "Blackburn",
  "Charlton Athletic FC": "Charlton",
  "Portsmouth FC": "Portsmouth",
  "Oxford United FC": "Oxford",
  "Stoke City FC": "Stoke",
  "Wrexham AFC": "Wrexham",
  "Club Atlético de Madrid": "Atletico Madrid",
  "Qarabağ Ağdam FK": "Qarabag",
  "FK Bodø/Glimt": "Bodo/Glimt",
}));

function stripDiacritics(s) {
  if (!s) return "";
  const specials = {
    "ß":"ss","Ø":"O","ø":"o","Æ":"AE","æ":"ae","Œ":"OE","œ":"oe",
    "Þ":"Th","þ":"th","Đ":"D","đ":"d","Ł":"L","ł":"l","Å":"A","å":"a",
  };
  s = s.replace(/[ßØøÆæŒœÞþĐđŁłÅå]/g, ch => specials[ch] || ch);
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function tidyName(name) {
  const mapped = NAME_MAP.get(name) || name;
  return stripDiacritics(mapped).replace(/\s+FC\b/i, "").trim();
}

function json(body, statusCode = 200, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fdFetch(path, attempt = 0) {
  if (!API_KEY) throw new Error("Missing FOOTBALL_DATA_API_KEY");

  // Netlify Node 18+ has global fetch
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is not available. Set NODE_VERSION=18 (or 20) on Netlify.");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "X-Auth-Token": API_KEY },
  });

  if (res.status === 429) {
    if (attempt >= 3) throw new Error("football-data 429: rate limited (max retries hit)");
    const retry = parseInt(res.headers.get("retry-after") || "6", 10);
    await sleep(Math.max(1, Math.min(10, retry)) * 1000);
    return fdFetch(path, attempt + 1);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`football-data ${res.status}: ${txt.slice(0, 160)}`);
  }

  return res.json();
}

function getComps(event) {
  const raw = (event.queryStringParameters && event.queryStringParameters.comps) || "PL,ELC,CL,WC,EC";
  return raw.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
}

function todayRangeLondon() {
  // London "today" in YYYY-MM-DD
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (t) => parts.find(p => p.type === t)?.value || "01";
  const y = get("year"), m = get("month"), d = get("day");
  const from = `${y}-${m}-${d}`;

  // tomorrow (exclusive) — use UTC-safe add
  const dt = new Date(`${from}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + 1);
  const to = dt.toISOString().slice(0, 10);

  return { from, to };
}

function compactMatch(m, compOverride) {
  const comp = compOverride || m?.competition?.code || "";
  return {
    id: m.id,
    comp: String(comp).toUpperCase(),
    status: m.status,
    utcDate: m.utcDate,
    matchday: m.matchday,
    stage: m.stage,
    group: m.group || null,
    homeTeam: { id: m.homeTeam?.id, name: tidyName(m.homeTeam?.name || "") },
    awayTeam: { id: m.awayTeam?.id, name: tidyName(m.awayTeam?.name || "") },
    score: m.score || {},
  };
}

exports.handler = async (event) => {
  try {
    const comps = getComps(event);
    const { from, to } = todayRangeLondon();

    const key = `${from}|${to}|${comps.join(",")}`;
    const now = Date.now();

    if (cache.data && cache.key === key && (now - cache.ts) < CACHE_MS) {
      return json({
        ok: true,
        cached: true,
        build: BUILD_ID,
        dateFrom: from,
        dateTo: to,
        competitions: comps,
        matches: cache.data,
        warnings: [],
      });
    }

    const out = [];
    const warnings = [];

    // 1) Day listing per competition (pre/live/finished all included as the API provides)
    for (const comp of comps) {
      try {
        const data = await fdFetch(
          `/competitions/${encodeURIComponent(comp)}/matches?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`
        );
        const matches = Array.isArray(data.matches) ? data.matches : [];
        for (const m of matches) out.push(compactMatch(m, comp));
      } catch (e) {
        warnings.push(`comp ${comp}: ${e.message || e}`);
      }
    }

    // 2) LIVE/HT override per competition (this is the important fix)
    // This avoids the flaky global /matches endpoint entirely.
    for (const comp of comps) {
      try {
        const liveData = await fdFetch(
          `/competitions/${encodeURIComponent(comp)}/matches?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}&status=IN_PLAY,PAUSED`
        );
        const liveMatches = Array.isArray(liveData.matches) ? liveData.matches : [];
        for (const m of liveMatches) out.push(compactMatch(m, comp)); // overwrites by id below
      } catch (e) {
        // Don’t fail the whole response if live filter isn’t allowed on your plan
        warnings.push(`live ${comp}: ${e.message || e}`);
      }
    }

    // 3) De-dupe by id (later overwrites earlier -> live entries win)
    const byId = new Map();
    for (const m of out) byId.set(m.id, m);
    const merged = Array.from(byId.values());

    cache = { ts: now, key, data: merged };

    return json({
      ok: true,
      cached: false,
      build: BUILD_ID,
      dateFrom: from,
      dateTo: to,
      competitions: comps,
      matches: merged,
      warnings,
    });
  } catch (e) {
    return json({ ok: false, error: (e && e.message) ? e.message : String(e), build: BUILD_ID }, 500);
  }
};
