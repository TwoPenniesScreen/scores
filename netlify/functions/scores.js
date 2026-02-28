// Netlify Function: /.netlify/functions/scores
// Fetches matches from football-data.org and returns a compact, front-end friendly payload.
// IMPORTANT: set env var FOOTBALL_DATA_API_KEY in Netlify site settings.

const API_BASE = "https://api.football-data.org/v4";
const API_KEY = process.env.FOOTBALL_DATA_API_KEY || process.env.FOOTBALL_DATA_TOKEN || "";

// In-memory cache (works on warm instances; safe fallback if cold)
let cache = { ts: 0, key: "", data: null };
const CACHE_MS = 10_000; // 10s

// Small UK-friendly name map (extend as needed)
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
  // Handle special letters not covered by NFD combining marks
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
  await new Promise(r => setTimeout(r, ms));
}

async function fdFetch(path) {
  if (!API_KEY) throw new Error("Missing FOOTBALL_DATA_API_KEY");
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "X-Auth-Token": API_KEY },
  });

  // football-data sometimes answers 429 with a message about waiting
  if (res.status === 429) {
    const retry = parseInt(res.headers.get("retry-after") || "6", 10);
    await sleep(Math.max(1, Math.min(10, retry)) * 1000);
    return fdFetch(path);
  }
  if (!res.ok) {
    const txt = await res.text().catch(()=> "");
    throw new Error(`football-data ${res.status}: ${txt.slice(0,120)}`);
  }
  return res.json();
}

function getComps(event) {
  const raw = (event.queryStringParameters && event.queryStringParameters.comps) || "PL,ELC,CL,WC,EC";
  return raw.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
}

function todayRangeLondon() {
  // London day boundaries; send dateFrom/To as YYYY-MM-DD
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year:"numeric", month:"2-digit", day:"2-digit"
  }).formatToParts(new Date());
  const get = (t)=> parts.find(p=>p.type===t)?.value || "01";
  const y = get("year"), m = get("month"), d = get("day");
  const from = `${y}-${m}-${d}`;

  // to = tomorrow (exclusive)
  const dt = new Date(`${from}T00:00:00`);
  dt.setDate(dt.getDate() + 1);
  const to = dt.toISOString().slice(0,10);
  return { from, to };
}

exports.handler = async (event) => {
  try {
    const comps = getComps(event);
    const { from, to } = todayRangeLondon();

    const key = `${from}|${to}|${comps.join(",")}`;
    const now = Date.now();
    if (cache.data && cache.key === key && (now - cache.ts) < CACHE_MS) {
      return json({ ok:true, cached:true, dateFrom: from, dateTo: to, competitions: comps, matches: cache.data });
    }

    // Fetch per competition. (football-data supports competitions=CSV on /matches,
    // but some plans behave inconsistently; this is the safest.)
    const out = [];
    for (const comp of comps) {
      const data = await fdFetch(`/competitions/${encodeURIComponent(comp)}/matches?dateFrom=${from}&dateTo=${to}`);
      const matches = Array.isArray(data.matches) ? data.matches : [];
      for (const m of matches) {
        out.push({
          id: m.id,
          comp,
          status: m.status,
          utcDate: m.utcDate,
          matchday: m.matchday,
          stage: m.stage,
          group: m.group || null,
          homeTeam: { id: m.homeTeam?.id, name: tidyName(m.homeTeam?.name || "") },
          awayTeam: { id: m.awayTeam?.id, name: tidyName(m.awayTeam?.name || "") },
          score: m.score || {},
        });
      }
    }

    // De-dupe in case of overlap
    const seen = new Set();
    const deduped = out.filter(m => (seen.has(m.id) ? false : (seen.add(m.id), true)));

    cache = { ts: now, key, data: deduped };
    return json({ ok:true, cached:false, dateFrom: from, dateTo: to, competitions: comps, matches: deduped });
  } catch (e) {
    return json({ ok:false, error: (e && e.message) ? e.message : String(e) }, 500);
  }
};
