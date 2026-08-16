// Netlify Function: /.netlify/functions/scores
// IMPORTANT: set env var FOOTBALL_DATA_API_KEY (or FOOTBALL_DATA_TOKEN) in Netlify.
// Requires Node 18+ (global fetch). In netlify.toml: NODE_VERSION = "18"

const API_BASE = "https://api.football-data.org/v4";
const API_KEY =
  process.env.FOOTBALL_DATA_API_KEY ||
  process.env.FOOTBALL_DATA_TOKEN ||
  "";

// Warm-instance cache only. This is a short, normal polling cache—not a
// last-known-good fallback. Failed or incomplete responses are never cached.
let cache = { ts: 0, key: "", data: null };

const CACHE_MS = 35_000;
const UPSTREAM_TIMEOUT_MS = 8_000;

// UK-friendly name map (extend as needed)
const NAME_MAP = new Map(Object.entries({
  "AFC Bournemouth": "Bournemouth",
  "Sunderland AFC": "Sunderland",
  "Manchester United FC": "Manchester Utd",
  "Manchester City FC": "Manchester City",
  "Tottenham Hotspur FC": "Tottenham Hotspur",
  "Wolverhampton Wanderers FC": "Wolves",
  "Brighton & Hove Albion FC": "Brighton",
  "Brighton and Hove Albion FC": "Brighton",
  "Newcastle United FC": "Newcastle",
  "West Ham United FC": "West Ham",
  "Nottingham Forest FC": "Nott'm Forest",
  "Crystal Palace FC": "Crystal Palace",
  "Queens Park Rangers FC": "QPR",
  "Sheffield Wednesday FC": "Sheffield Wed",
  "Sheffield United FC": "Sheffield Utd",
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
  "Stoke City FC": "Stoke City",
  "Wrexham AFC": "Wrexham",

  // examples of diacritics removal
  "Club Atlético de Madrid": "Atletico Madrid",
  "Qarabağ Ağdam FK": "Qarabag",
  "FK Bodø/Glimt": "Bodo/Glimt",
  "Galatasaray SK": "Galatasaray",
  "FC Barcelona": "Barcelona",
  "FC Bayern München": "Bayern Munich",
  "Atalanta BC": "Atalanta",
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
  return stripDiacritics(mapped)
    .replace(/\s+FC\b/i, "")
    .replace(/\bAFC\b/i, "") // remove trailing AFC if it survives mapping
    .replace(/\s+/g, " ")
    .trim();
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

async function fdFetch(path) {
  if (!API_KEY) throw new Error("Missing FOOTBALL_DATA_API_KEY");
  if (typeof fetch !== "function") {
    throw new Error("Global fetch not available. Set NODE_VERSION=18 (or 20) on Netlify.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: {
        "X-Auth-Token": API_KEY,
        "X-Api-Version": "v4.1",
      },
      signal: controller.signal,
    });

    // Fail fast and let the screen show its generic slide. Retrying a rate
    // limited request immediately only spends more of the upstream allowance.
    if (res.status === 429) {
      throw new Error("football-data 429: rate limited");
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`football-data ${res.status}: ${txt.slice(0, 200)}`);
    }

    return res.json();
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`football-data timed out after ${UPSTREAM_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getComps(event) {
  // Default: NO championship
  const raw =
    (event.queryStringParameters && event.queryStringParameters.comps) ||
    "PL,CL,EC,WC";
  return raw
    .split(",")
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
}

function londonDateYYYYMMDD(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (t) => parts.find(p => p.type === t)?.value || "01";
  const y = get("year"), m = get("month"), d = get("day");
  return `${y}-${m}-${d}`;
}

function todayRangeLondon() {
  const now = new Date();
  const from = londonDateYYYYMMDD(now);

  // Look ahead 30 days.
  const t = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));
  const to = londonDateYYYYMMDD(t);

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

    // ✅ add these two lines
    minute: (m.minute ?? null),
    injuryTime: (m.injuryTime ?? null),
  };
}

exports.handler = async (event) => {
  try {
    const comps = getComps(event);
    const { from, to } = todayRangeLondon();

    const cacheKey = `${from}|${to}|${comps.join(",")}`;
    const now = Date.now();

    if (cache.data && cache.key === cacheKey && (now - cache.ts) < CACHE_MS) {
      return json({
        ok: true,
        cached: true,
        dateFrom: from,
        dateTo: to,
        competitions: comps,
        matches: cache.data,
        warnings: [],
      });
    }

    // Fetch selected competitions together so one slow competition cannot make
    // the whole function wait several times over.
    const results = await Promise.allSettled(comps.map(async (comp) => {
      const data = await fdFetch(
        `/competitions/${encodeURIComponent(comp)}/matches?dateFrom=${from}&dateTo=${to}`
      );
      return { comp, matches: Array.isArray(data.matches) ? data.matches : [] };
    }));

    const failures = [];
    const out = [];

    results.forEach((result, index) => {
      const comp = comps[index];
      if (result.status === "rejected") {
        failures.push({ comp, error: result.reason?.message || String(result.reason) });
        return;
      }
      for (const match of result.value.matches) {
        out.push(compactMatch(match, result.value.comp));
      }
    });

    // Partial data is not trustworthy: a failed competition could be the one
    // currently live. Return an error so the display clears to its generic slide.
    if (failures.length > 0) {
      console.error("Scores feed incomplete", failures);
      return json({
        ok: false,
        error: "Scores temporarily unavailable",
        failedCompetitions: failures.map(({ comp }) => comp),
      }, 503, { "retry-after": "60" });
    }

    // De-dupe by id (last write wins)
    const byId = new Map();
    for (const m of out) byId.set(m.id, m);
    const merged = Array.from(byId.values());

    cache = { ts: now, key: cacheKey, data: merged };

    return json({
      ok: true,
      cached: false,
      dateFrom: from,
      dateTo: to,
      competitions: comps,
      matches: merged,
      warnings: [],
    });
  } catch (e) {
    return json({ ok: false, error: e?.message ? e.message : String(e) }, 500);
  }
};
