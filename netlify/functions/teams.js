
/**
 * Netlify Function: /.netlify/functions/teams
 *
 * Returns unique team IDs+names for selected competitions (from football-data.org v4).
 * Requires env var: FOOTBALL_DATA_TOKEN
 *
 * Query params:
 *   comps=PL,ELC,CL,WC,EC  (optional; default these)
 */
const API_BASE = "https://api.football-data.org/v4";
const DEFAULT_COMPS = ["PL","ELC","CL","WC","EC"];

// in-memory cache (per lambda instance)
const cache = new Map(); // key -> {ts, data}
const TTL_MS = 10 * 60 * 1000; // 10 minutes

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
    if (!token) return jsonResponse(500, { ok:false, error:"Missing FOOTBALL_DATA_TOKEN env var on Netlify." });

    const qs = event.queryStringParameters || {};
    const comps = (qs.comps || "").split(",").map(s=>s.trim().toUpperCase()).filter(Boolean);
    const compList = comps.length ? comps : DEFAULT_COMPS;

    const cacheKey = compList.join("|");
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < TTL_MS) {
      return jsonResponse(200, { ok:true, cached:true, competitions: compList, teams: cached.data });
    }

    const headers = { "X-Auth-Token": token };
    const byId = new Map(); // id -> name

    for (const comp of compList) {
      const url = `${API_BASE}/competitions/${encodeURIComponent(comp)}/teams`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        // don't fail whole request; just skip comp
        continue;
      }
      const data = await res.json();
      const teams = Array.isArray(data.teams) ? data.teams : [];
      for (const t of teams) {
        if (t && typeof t.id === "number" && t.name) {
          if (!byId.has(t.id)) byId.set(t.id, t.name);
        }
      }
    }

    const out = Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a,b)=> a.name.localeCompare(b.name));

    cache.set(cacheKey, { ts: Date.now(), data: out });
    return jsonResponse(200, { ok:true, cached:false, competitions: compList, teams: out });

  } catch (err) {
    return jsonResponse(500, { ok:false, error: String(err?.message || err) });
  }
};
