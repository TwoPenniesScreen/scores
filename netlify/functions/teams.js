/**
 * Netlify Function: /.netlify/functions/teams
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
    .replace(/Ø/g, "O")
    .replace(/ø/g, "o")
    .replace(/Æ/g, "AE")
    .replace(/æ/g, "ae")
    .replace(/[-./]/g, " ")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Remove clutter + abbreviations
function stripCommonWords(str){
  return str
    .replace(/\b(FC|CF|BC|FK|SK|SFP|JK|AGDAM)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ----------------------------------------------------
// 🇬🇧 TEAM NAME OVERRIDES
// ----------------------------------------------------

const TEAM_OVERRIDES = {

  // Germany
  "BAYERN MUNCHEN": "BAYERN MUNICH",
  "BORUSSIA MONCHENGLADBACH": "MONCHENGLADBACH",
  "EINTRACHT FRANKFURT": "FRANKFURT",
  "BAYER 04 LEVERKUSEN": "LEVERKUSEN",

  // Italy
  "INTERNAZIONALE": "INTER MILAN",
  "INTERNAZIONALE MILANO": "INTER MILAN",
  "SSC NAPOLI": "NAPOLI",

  // France
  "PARIS SAINT GERMAIN": "PSG",
  "OLYMPIQUE DE MARSEILLE": "MARSEILLE",
  "OLYMPIQUE LYONNAIS": "LYON",
  "AS MONACO": "MONACO",

  // Portugal
  "SPORTING CLUBE DE PORTUGAL": "SPORTING LISBON",
  "SPORT LISBOA E BENFICA": "BENFICA",

  // Netherlands
  "AFC AJAX": "AJAX",
  "PSV EINDHOVEN": "PSV",

  // Spain
  "CLUB ATLETICO DE MADRID": "ATLETICO MADRID",

  // Belgium
  "CLUB BRUGGE KV": "CLUB BRUGGE",
  "ROYALE UNION SAINT GILLOISE": "UNION SG",

  // Austria
  "RED BULL SALZBURG": "SALZBURG",

  // Greece
  "PAE OLYMPIAKOS": "OLYMPIAKOS",

  // Denmark
  "KOBENHAVN": "COPENHAGEN"
};

// ----------------------------------------------------
// 🧱 LENGTH SAFETY
// ----------------------------------------------------

function enforceMaxLength(name, max = 22){
  if (name.length <= max) return name;
  return name.slice(0, max).trim();
}

// ----------------------------------------------------
// 🎯 FINAL FORMATTER
// ----------------------------------------------------

function formatTeamName(originalName){
  const normalised = normaliseText(originalName);

  // First try exact override BEFORE stripping
  if (TEAM_OVERRIDES[normalised]) {
    return enforceMaxLength(TEAM_OVERRIDES[normalised]);
  }

  // Otherwise clean + abbreviate
  const stripped = stripCommonWords(normalised);

  return enforceMaxLength(stripped);
}

// ----------------------------------------------------
// RESPONSE HELPER
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

// ----------------------------------------------------
// MAIN HANDLER
// ----------------------------------------------------

exports.handler = async (event) => {
  try {

    const token = process.env.FOOTBALL_DATA_TOKEN;
    if (!token) {
      return jsonResponse(500, {
        ok:false,
        error:"Missing FOOTBALL_DATA_TOKEN env var."
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
