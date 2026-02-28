
/**
 * Netlify Function: /.netlify/functions/scores
 *
 * Requires env var: FOOTBALL_DATA_TOKEN
 * Calls football-data.org v4 and returns simplified payload.
 *
 * Query params:
 *   comps=PL,CL,FAC,EL,ECL,WC,EC   (optional)
 *   dateFrom=YYYY-MM-DD            (optional; default today in Europe/London)
 *   dateTo=YYYY-MM-DD              (optional; default today+1)
 */
const API_BASE = "https://api.football-data.org/v4";
// Keep to free-plan accessible competitions to avoid 403/404 spam.
// Requested: PL + CL + WC + EC only.
const DEFAULT_COMPS = ["PL","ELC","CL","WC","EC"];

// in-memory cache to reduce API calls
const cache = new Map(); // key -> {ts, data}
const TTL_MS = 5_000;

function jsonResponse(statusCode, bodyObj, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
    body: JSON.stringify(bodyObj),
  };
}

function londonTodayISO() {
  // Robust-enough for UK: get date string in Europe/London via Intl
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year:"numeric", month:"2-digit", day:"2-digit" })
    .formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDaysISO(isoDate, days) {
  const [y,m,d] = isoDate.split("-").map(n => parseInt(n,10));
  const dt = new Date(Date.UTC(y, m-1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth()+1).padStart(2,"0");
  const dd = String(dt.getUTCDate()).padStart(2,"0");
  return `${yy}-${mm}-${dd}`;
}

exports.handler = async (event) => {
  try {
    const token = process.env.FOOTBALL_DATA_TOKEN;
    if (!token) {
      return jsonResponse(500, { ok:false, error:"Missing FOOTBALL_DATA_TOKEN env var on Netlify." });
    }

    const qs = event.queryStringParameters || {};
    const comps = (qs.comps || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
    const compList = comps.length ? comps : DEFAULT_COMPS;

    const dateFrom = (qs.dateFrom || londonTodayISO()).trim();
    const dateTo = (qs.dateTo || addDaysISO(dateFrom, 1)).trim();

    const cacheKey = `${compList.join("|")}::${dateFrom}::${dateTo}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < TTL_MS) {
      return jsonResponse(200, { ok:true, cached:true, dateFrom, dateTo, competitions: compList, matches: cached.data });
    }

    const headers = { "X-Auth-Token": token };

    // Fetch each competition matches for date range (in parallel for faster cold-starts)
    const results = [];
    const fetchOne = async (comp) => {
      const url = `${API_BASE}/competitions/${encodeURIComponent(comp)}/matches?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        const text = await res.text().catch(()=>"");
        // don't fail whole response; just include error marker for this comp
        return [{ __error:true, comp, status: res.status, body: text.slice(0,400) }];
      }
      const data = await res.json();
      const matches = Array.isArray(data.matches) ? data.matches : [];
      return matches.map((m) => ({
        // Normalize minimal fields
        id: m.id,
        comp: comp,
        status: m.status,
        utcDate: m.utcDate,
        matchday: m.matchday ?? null,
        stage: m.stage ?? null,
        group: m.group ?? null,
        homeTeam: { id: m.homeTeam?.id ?? null, name: m.homeTeam?.name ?? "" },
        awayTeam: { id: m.awayTeam?.id ?? null, name: m.awayTeam?.name ?? "" },
       score: {
  fullTime: m.score?.fullTime ?? { home:null, away:null },
  halfTime: m.score?.halfTime ?? { home:null, away:null },
  regularTime: m.score?.regularTime ?? { home:null, away:null },
  extraTime: m.score?.extraTime ?? { home:null, away:null },
  penalties: m.score?.penalties ?? { home:null, away:null },
},
      }));
    };

    const perComp = await Promise.all(compList.map(fetchOne));
    for (const arr of perComp) results.push(...arr);

    cache.set(cacheKey, { ts: Date.now(), data: results });
    return jsonResponse(200, { ok:true, cached:false, dateFrom, dateTo, competitions: compList, matches: results });

  } catch (err) {
    return jsonResponse(500, { ok:false, error: String(err?.message || err) });
  }
};
