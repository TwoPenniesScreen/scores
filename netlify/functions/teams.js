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
    .toUpperCase()
    .trim();
}

// ----------------------------------------------------
// 🇬🇧 ANGLO-STYLE TEAM NAME OVERRIDES
// ----------------------------------------------------

const TEAM_OVERRIDES = {
  // Germany
  "BAYERN MUNCHEN": "BAYERN MUNICH",
  "BORUSSIA MONCHENGLADBACH": "MONCHENGLADBACH",
  "EINTRACHT FRANKFURT": "FRANKFURT",

  // Italy
  "INTERNAZIONALE": "INTER MILAN",
  "AC MILAN": "MILAN",

  // France
  "PARIS SAINT GERMAIN": "PSG",
  "OLYMPIQUE MARSEILLE": "MARSEILLE",
  "OLYMPIQUE LYONNAIS": "LYON",

  // Portugal
  "SPORTING CP": "SPORTING LISBON",
  "SPORTING CLUBE DE PORTUGAL": "SPORTING LISBON",
  "SL BENFICA": "BENFICA",
  "FC PORTO": "PORTO",

  // Netherlands
  "PSV EINDHOVEN": "PSV",
  "AFC AJAX": "AJAX",

  // Spain
  "ATLETICO DE MADRID": "ATLETICO MADRID",

  // Scotland
  "RANGERS FC": "RANGERS",
  "CELTIC FC": "CELTIC",

  // Austria
  "FC RED BULL SALZBURG": "SALZBURG",

  // Switzerland
  "BSC YOUNG BOYS": "YOUNG BOYS",

  // Belgium
  "CLUB BRUGGE KV": "CLUB BRUGGE",

  // Turkey
  "GALATASARAY SK": "GALATASARAY",
  "FENERBAHCE SK": "FENERBAHCE",
  "BESIKTAS JK": "BESIKTAS"
};

function formatTeamName(originalName){
  const clean = normaliseText(originalName);
  return TEAM_OVERRIDES[clean] || clean;
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
