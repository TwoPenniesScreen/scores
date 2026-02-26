/**
 * Netlify Function: /.netlify/functions/teams
 *
 * Returns unique team IDs+names for selected competitions.
 * Requires env var: FOOTBALL_DATA_TOKEN
 */

const API_BASE = "https://api.football-data.org/v4";
const DEFAULT_COMPS = ["PL","ELC","CL","WC","EC"];

const cache = new Map();
const TTL_MS = 10 * 60 * 1000;

// ----------------------------------------------------
// 🔤 TEXT NORMALISER
// ----------------------------------------------------

function normaliseText(str){
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-./]/g, " ")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function stripCommonWords(str){
  return str
    .replace(/\b(FC|CF|BC|FK|SK|SFP|JK|AGDAM|MILANO)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const TEAM_OVERRIDES = {
  "BAYERN MUNCHEN": "BAYERN MUNICH",
  "INTERNAZIONALE": "INTER MILAN",
  "PARIS SAINT GERMAIN": "PSG",
  "SPORT LISBOA E BENFICA": "BENFICA",
  "SPORTING CLUBE DE PORTUGAL": "SPORTING LISBON",
  "PSV EINDHOVEN": "PSV",
  "CLUB BRUGGE": "CLUB BRUGGE",
  "BORUSSIA MONCHENGLADBACH": "MONCHENGLADBACH",
  "OLYMPIQUE DE MARSEILLE": "MARSEILLE",
  "OLYMPIQUE LYONNAIS": "LYON"
};

function formatTeamName(originalName){
  const normalised = normaliseText(originalName);
  const stripped = stripCommonWords(normalised);

  return TEAM_OVERRIDES[stripped] || stripped;
}

// ----------------------------------------------------

function jsonResponse(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(bodyObj),
  };
}

exports.handler = async (event) => {
  try {
    const token = process.env.FOOTBALL_DATA_TOKEN;
    if (!token) {
      return jsonResponse(500, {
        ok:false,
        error:"Missing FOOTBALL_DATA_TOKEN env var on Netlify."
      });
    }

    const qs = event.queryStringParameters || {};
    const comps = (qs.comps || "")
      .split(",")
      .map(s=>s.trim().toUpperCase())
      .filter(Boolean);

    const compList = comps.length ? comps : DEFAULT_COMPS;
    const cacheKey = compList.join("|");

    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < TTL_MS) {
      return jsonResponse(200, {
        ok:true,
        cached:true,
        competitions: compList,
        teams: cached.data
      });
    }

    const headers = { "X-Auth-Token": token };
    const byId = new Map();

    for (const comp of compList) {
      const url = `${API_BASE}/competitions/${encodeURIComponent(comp)}/teams`;
      const res = await fetch(url, { headers });

      if (!res.ok) continue;

      const data = await res.json();
      const teams = Array.isArray(data.teams) ? data.teams : [];

      for (const t of teams) {
        if (t && typeof t.id === "number" && t.name) {
          if (!byId.has(t.id)) {
            byId.set(t.id, formatTeamName(t.name));
          }
        }
      }
    }

    const out = Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a,b)=> a.name.localeCompare(b.name, "en", { sensitivity:"base" }));

    cache.set(cacheKey, { ts: Date.now(), data: out });

    return jsonResponse(200, {
      ok:true,
      cached:false,
      competitions: compList,
      teams: out
    });

  } catch (err) {
    return jsonResponse(500, {
      ok:false,
      error: String(err?.message || err)
    });
  }
};
