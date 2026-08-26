import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
import {
  COMPETITION_BY_ID,
  DEFAULT_SETTINGS,
  normaliseCompetitionIds,
  resolveCompetition,
  sanitiseSettings,
} from "./_shared/catalog.js";
import {
  cacheTtlForMatches,
  mergeEspnIntoFootballData,
  normaliseEspn,
  normaliseFootballData,
} from "./_shared/scores-core.js";

const FOOTBALL_DATA_BASE = "https://api.football-data.org/v4";
const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const UPSTREAM_TIMEOUT_MS = 9_000;

function response(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function scoresStore() {
  return getStore({ name: "scores", consistency: "strong" });
}

function londonDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value || "01";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function compactDate(value: string) {
  return value.replaceAll("-", "");
}

function dateRange() {
  const now = new Date();
  return {
    from: londonDate(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
    to: londonDate(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)),
  };
}

async function fetchJson(url: string, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, { headers, signal: controller.signal });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      throw new Error(`${upstream.status}: ${detail.slice(0, 160)}`);
    }
    return await upstream.json();
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error(`timed out after ${UPSTREAM_TIMEOUT_MS / 1000}s`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFootballData(competition: any, from: string, to: string) {
  const token = Netlify.env.get("FOOTBALL_DATA_API_KEY") || Netlify.env.get("FOOTBALL_DATA_TOKEN") || "";
  if (!token) throw new Error("football-data key is not configured");
  if (!competition.footballDataCode) throw new Error("competition is not included in the football-data selection");
  const path = `/competitions/${encodeURIComponent(competition.footballDataCode)}/matches`;
  const query = `?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}`;
  try {
    const data = await fetchJson(`${FOOTBALL_DATA_BASE}${path}${query}`, {
      "X-Auth-Token": token,
      "X-Api-Version": "v4.1",
    });
    return (Array.isArray(data.matches) ? data.matches : []).map((match: any) => normaliseFootballData(match, competition));
  } catch (error: any) {
    throw new Error(`football-data ${error?.message || error}`);
  }
}

async function fetchEspn(competition: any, from: string, to: string) {
  if (!competition.espnSlug) throw new Error("ESPN does not list this competition");
  const dates = `${compactDate(from)}-${compactDate(to)}`;
  const url = `${ESPN_BASE}/${encodeURIComponent(competition.espnSlug)}/scoreboard?dates=${dates}&limit=100`;
  try {
    const data = await fetchJson(url);
    return (Array.isArray(data.events) ? data.events : []).map((event: any) => normaliseEspn(event, competition));
  } catch (error: any) {
    throw new Error(`ESPN ${error?.message || error}`);
  }
}

async function fetchCompetition(competition: any, sourceMode: string, from: string, to: string) {
  const footballDataAvailable = Boolean(
    competition.footballDataCode &&
    (Netlify.env.get("FOOTBALL_DATA_API_KEY") || Netlify.env.get("FOOTBALL_DATA_TOKEN")),
  );

  if (sourceMode === "football-data") {
    return { provider: "football-data", matches: await fetchFootballData(competition, from, to), fallback: false };
  }
  if (sourceMode === "espn" || !footballDataAvailable) {
    return { provider: "espn", matches: await fetchEspn(competition, from, to), fallback: false };
  }

  const [footballDataResult, espnResult] = await Promise.allSettled([
    fetchFootballData(competition, from, to),
    fetchEspn(competition, from, to),
  ]);

  if (footballDataResult.status === "fulfilled") {
    if (espnResult.status === "fulfilled") {
      const merged = mergeEspnIntoFootballData(footballDataResult.value, espnResult.value);
      return {
        provider: "football-data+espn",
        matches: merged.matches,
        enrichedCount: merged.enrichedCount,
        fallback: false,
      };
    }
    return {
      provider: "football-data",
      matches: footballDataResult.value,
      enrichedCount: 0,
      enrichmentError: `ESPN ${espnResult.reason?.message || espnResult.reason}`,
      fallback: false,
    };
  }

  if (espnResult.status === "fulfilled") {
    return {
      provider: "espn",
      matches: espnResult.value,
      fallback: true,
      primaryError: footballDataResult.reason?.message || String(footballDataResult.reason),
    };
  }

  throw new Error(`${footballDataResult.reason?.message || footballDataResult.reason}; ${espnResult.reason?.message || espnResult.reason}`);
}

async function storedSettings() {
  try {
    const value = await scoresStore().get("settings", { type: "json" });
    return sanitiseSettings(value || DEFAULT_SETTINGS);
  } catch (error) {
    console.warn("Unable to read stored settings; using defaults", error);
    return sanitiseSettings(DEFAULT_SETTINGS);
  }
}

function applyQueryOverrides(settings: any, url: URL) {
  const next = { ...settings };
  if (url.searchParams.has("comps")) {
    const ids = normaliseCompetitionIds((url.searchParams.get("comps") || "").split(","));
    if (ids.length) next.competitions = ids;
  }
  if (url.searchParams.has("source")) next.sourceMode = url.searchParams.get("source");
  if (url.searchParams.has("max")) next.maxRows = url.searchParams.get("max");
  if (url.searchParams.has("pre")) next.preMinutes = url.searchParams.get("pre");
  if (url.searchParams.has("post")) next.postMinutes = url.searchParams.get("post");
  return sanitiseSettings(next);
}

function safeCachedMatches(cached: any, now: Date) {
  if (!cached || !Array.isArray(cached.matches)) return null;
  const fetchedAt = new Date(cached.fetchedAt || 0);
  if (!Number.isFinite(fetchedAt.getTime())) return null;
  const ttl = cacheTtlForMatches(cached.matches, now);
  return now.getTime() - fetchedAt.getTime() < ttl ? cached : null;
}

async function loadCompetition(competition: any, sourceMode: string, from: string, to: string, now: Date) {
  const store = scoresStore();
  const cacheKey = `feed:${sourceMode}:${competition.id}`;
  let cached: any = null;
  try {
    cached = await store.get(cacheKey, { type: "json" });
  } catch (error) {
    console.warn(`Unable to read ${competition.id} cache`, error);
  }

  const fresh = safeCachedMatches(cached, now);
  if (fresh) {
    return {
      competition: competition.id,
      provider: fresh.provider,
      matches: fresh.matches,
      cached: true,
      stale: false,
      fallback: Boolean(fresh.fallback),
      enrichedCount: Number(fresh.enrichedCount || 0),
      fetchedAt: fresh.fetchedAt,
      error: null,
      warning: fresh.enrichmentError || null,
    };
  }

  try {
    const upstream: any = await fetchCompetition(competition, sourceMode, from, to);
    const value = {
      provider: upstream.provider,
      matches: upstream.matches,
      fallback: Boolean(upstream.fallback),
      primaryError: upstream.primaryError || null,
      enrichmentError: upstream.enrichmentError || null,
      enrichedCount: Number(upstream.enrichedCount || 0),
      fetchedAt: now.toISOString(),
    };
    try {
      await store.setJSON(cacheKey, value);
    } catch (error) {
      console.warn(`Unable to save ${competition.id} cache`, error);
    }
    return {
      competition: competition.id,
      provider: value.provider,
      matches: value.matches,
      cached: false,
      stale: false,
      fallback: value.fallback,
      enrichedCount: value.enrichedCount,
      fetchedAt: value.fetchedAt,
      error: value.primaryError,
      warning: value.enrichmentError,
    };
  } catch (error: any) {
    const cachedHasLive = (cached?.matches || []).some((match: any) => ["IN_PLAY", "PAUSED", "LIVE"].includes(String(match.status).toUpperCase()));
    const cachedAge = now.getTime() - new Date(cached?.fetchedAt || 0).getTime();
    const canUseScheduleCache = cached && !cachedHasLive && cachedAge < 12 * 60 * 60 * 1000;
    return {
      competition: competition.id,
      provider: cached?.provider || null,
      matches: canUseScheduleCache ? cached.matches : [],
      cached: Boolean(canUseScheduleCache),
      stale: Boolean(canUseScheduleCache),
      fallback: Boolean(cached?.fallback),
      enrichedCount: Number(cached?.enrichedCount || 0),
      fetchedAt: cached?.fetchedAt || null,
      error: error?.message || String(error),
      warning: cached?.enrichmentError || null,
    };
  }
}

export async function scoresHandler(request: Request, _context?: Context) {
  if (request.method !== "GET") return response({ ok: false, error: "Method not allowed" }, 405, { allow: "GET" });

  try {
    const url = new URL(request.url);
    const settings = applyQueryOverrides(await storedSettings(), url);
    const range = dateRange();
    const now = new Date();
    const competitions = settings.competitions
      .map((id: string) => COMPETITION_BY_ID.get(id))
      .filter(Boolean);

    const results = await Promise.all(
      competitions.map((competition: any) => loadCompetition(competition, settings.sourceMode, range.from, range.to, now)),
    );
    const matches = results.flatMap((result) => result.matches);
    const health = {
      checkedAt: now.toISOString(),
      sourceMode: settings.sourceMode,
      competitions: results.map(({ matches: competitionMatches, ...result }) => ({
        ...result,
        matchCount: competitionMatches.length,
      })),
    };

    try {
      const isSavedSettingsCheck = !["comps", "source", "max", "pre", "post"].some((key) => url.searchParams.has(key));
      if (isSavedSettingsCheck) await scoresStore().setJSON("health", health);
    } catch (error) {
      console.warn("Unable to save source health", error);
    }

    return response({
      ok: true,
      dateFrom: range.from,
      dateTo: range.to,
      serverNow: now.toISOString(),
      settings,
      matches,
      warnings: health.competitions.filter((item) => item.error || item.warning),
      health,
    });
  } catch (error: any) {
    console.error("Scores function failed", error);
    return response({ ok: false, error: error?.message || String(error) }, 500, { "retry-after": "60" });
  }
}

export default scoresHandler;

export const config: Config = {
  path: "/api/scores",
};
