import { publicCompetition } from "./catalog.js";

const NAME_MAP = new Map(Object.entries({
  "AFC Bournemouth": "Bournemouth",
  "Bournemouth AFC": "Bournemouth",
  "Sunderland AFC": "Sunderland",
  "Manchester United FC": "Manchester Utd",
  "Manchester United": "Manchester Utd",
  "Manchester City FC": "Manchester City",
  "Tottenham Hotspur FC": "Tottenham Hotspur",
  "Wolverhampton Wanderers FC": "Wolves",
  "Wolverhampton Wanderers": "Wolves",
  "Brighton & Hove Albion FC": "Brighton",
  "Brighton and Hove Albion FC": "Brighton",
  "Brighton & Hove Albion": "Brighton",
  "Newcastle United FC": "Newcastle",
  "Newcastle United": "Newcastle",
  "West Ham United FC": "West Ham",
  "West Ham United": "West Ham",
  "Nottingham Forest FC": "Nott'm Forest",
  "Nottingham Forest": "Nott'm Forest",
  "Crystal Palace FC": "Crystal Palace",
  "Queens Park Rangers FC": "QPR",
  "Queens Park Rangers": "QPR",
  "Sheffield Wednesday FC": "Sheffield Wed",
  "Sheffield Wednesday": "Sheffield Wed",
  "Sheffield United FC": "Sheffield Utd",
  "Sheffield United": "Sheffield Utd",
  "West Bromwich Albion FC": "West Brom",
  "West Bromwich Albion": "West Brom",
  "Preston North End FC": "Preston",
  "Preston North End": "Preston",
  "Millwall FC": "Millwall",
  "Leicester City FC": "Leicester",
  "Leicester City": "Leicester",
  "Derby County FC": "Derby",
  "Derby County": "Derby",
  "Swansea City AFC": "Swansea",
  "Swansea City": "Swansea",
  "Hull City AFC": "Hull",
  "Hull City": "Hull",
  "Coventry City FC": "Coventry",
  "Coventry City": "Coventry",
  "Norwich City FC": "Norwich",
  "Norwich City": "Norwich",
  "Blackburn Rovers FC": "Blackburn",
  "Blackburn Rovers": "Blackburn",
  "Charlton Athletic FC": "Charlton",
  "Charlton Athletic": "Charlton",
  "Portsmouth FC": "Portsmouth",
  "Oxford United FC": "Oxford",
  "Stoke City FC": "Stoke City",
  "Wrexham AFC": "Wrexham",
  "Club Atletico de Madrid": "Atletico Madrid",
  "Club Atlético de Madrid": "Atletico Madrid",
  "Qarabağ Ağdam FK": "Qarabag",
  "FK Bodø/Glimt": "Bodo/Glimt",
  "Galatasaray SK": "Galatasaray",
  "FC Barcelona": "Barcelona",
  "FC Bayern München": "Bayern Munich",
  "Bayern Munich": "Bayern Munich",
  "Atalanta BC": "Atalanta",
  "England National Team": "England",
  "Scotland National Team": "Scotland",
}));

export function stripDiacritics(value) {
  if (!value) return "";
  const specials = {
    "ß": "ss", "Ø": "O", "ø": "o", "Æ": "AE", "æ": "ae", "Œ": "OE", "œ": "oe",
    "Þ": "Th", "þ": "th", "Đ": "D", "đ": "d", "Ł": "L", "ł": "l", "Å": "A", "å": "a",
  };
  return String(value)
    .replace(/[ßØøÆæŒœÞþĐđŁłÅå]/g, (character) => specials[character] || character)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function tidyName(value) {
  const original = String(value || "").trim();
  const mapped = NAME_MAP.get(original) || original;
  return stripDiacritics(mapped)
    .replace(/\s+FC\b/i, "")
    .replace(/\s+AFC\b/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function competitionMeta(competition) {
  return publicCompetition(competition);
}

function emptyIncidents() {
  return {
    home: { goals: [], redCards: [] },
    away: { goals: [], redCards: [] },
  };
}

function incidentName(detail) {
  const athlete = detail?.athletesInvolved?.[0] || detail?.participants?.[0]?.athlete || {};
  const shortName = stripDiacritics(athlete.shortName || "")
    .replace(/^(?:[A-Za-z]\.[ ]*)+/, "")
    .trim();
  if (shortName) return shortName;
  const fullName = stripDiacritics(athlete.displayName || athlete.fullName || "").trim();
  return fullName.split(/\s+/).filter(Boolean).at(-1) || "Player";
}

function incidentTime(detail) {
  let value = String(detail?.clock?.displayValue || "").trim();
  if (!value && Number.isFinite(Number(detail?.clock?.value))) {
    value = String(Math.max(1, Math.ceil(Number(detail.clock.value) / 60)));
  }
  value = value.replace(/[’]/g, "'").replace(/'\s*\+\s*/g, "+");
  return value && !value.endsWith("'") ? `${value}'` : value;
}

function normaliseEspnIncidents(contest, homeId, awayId) {
  const incidents = emptyIncidents();
  for (const detail of Array.isArray(contest?.details) ? contest.details : []) {
    const teamId = String(detail?.team?.id ?? "");
    const side = teamId === String(homeId ?? "") ? "home" : teamId === String(awayId ?? "") ? "away" : null;
    if (!side) continue;
    const common = { name: incidentName(detail), time: incidentTime(detail) };
    if (detail?.scoringPlay && !detail?.shootout) {
      incidents[side].goals.push({
        ...common,
        ownGoal: Boolean(detail?.ownGoal),
        penalty: Boolean(detail?.penaltyKick),
      });
    }
    const typeText = String(detail?.type?.text || "").toLowerCase();
    if (detail?.redCard || typeText.includes("red card")) incidents[side].redCards.push(common);
  }
  return incidents;
}

export function normaliseFootballData(match, competition) {
  const status = String(match.status || "SCHEDULED").toUpperCase();
  const duration = String(match.score?.duration || "").toUpperCase();
  return {
    id: `fd-${match.id}`,
    sourceId: String(match.id || ""),
    provider: "football-data",
    comp: competition.id,
    competition: competitionMeta(competition),
    status,
    utcDate: match.utcDate,
    matchday: match.matchday ?? null,
    stage: match.stage || null,
    group: match.group || null,
    homeTeam: {
      id: match.homeTeam?.id ?? null,
      name: tidyName(match.homeTeam?.name || match.homeTeam?.shortName || ""),
    },
    awayTeam: {
      id: match.awayTeam?.id ?? null,
      name: tidyName(match.awayTeam?.name || match.awayTeam?.shortName || ""),
    },
    score: match.score || {},
    minute: match.minute ?? null,
    injuryTime: match.injuryTime ?? null,
    phase: duration === "PENALTY_SHOOTOUT" ? "PENS" : status === "PAUSED" ? "HT" : status === "FINISHED" ? "FT" : duration === "EXTRA_TIME" ? "ET" : null,
    incidents: emptyIncidents(),
  };
}

function espnStatus(event) {
  const type = event?.status?.type || event?.competitions?.[0]?.status?.type || {};
  const state = String(type.state || "").toLowerCase();
  const name = String(type.name || "").toUpperCase();
  if (name.includes("POSTPONED")) return "POSTPONED";
  if (name.includes("CANCELED") || name.includes("CANCELLED")) return "CANCELLED";
  if (name.includes("HALFTIME")) return "PAUSED";
  if (state === "in") return "IN_PLAY";
  if (state === "post" || type.completed) return "FINISHED";
  return "TIMED";
}

export function parseEspnClock(event) {
  const status = event?.status || event?.competitions?.[0]?.status || {};
  const raw = String(status.displayClock || status.type?.shortDetail || status.type?.detail || "");
  const match = raw.match(/(\d+)(?:['’]?\s*\+\s*(\d+))?/);
  if (!match) return { minute: null, injuryTime: null };
  return {
    minute: numberOrNull(match[1]),
    injuryTime: numberOrNull(match[2]),
  };
}

export function normaliseEspn(event, competition) {
  const contest = event?.competitions?.[0] || {};
  const competitors = Array.isArray(contest.competitors) ? contest.competitors : [];
  const home = competitors.find((team) => team.homeAway === "home") || competitors[0] || {};
  const away = competitors.find((team) => team.homeAway === "away") || competitors[1] || {};
  const status = espnStatus(event);
  const clock = parseEspnClock(event);
  const homeScore = numberOrNull(home.score);
  const awayScore = numberOrNull(away.score);
  const homeShootout = numberOrNull(home.shootoutScore);
  const awayShootout = numberOrNull(away.shootoutScore);
  const duration = homeShootout !== null || awayShootout !== null ? "PENALTY_SHOOTOUT" : "REGULAR";
  const type = event?.status?.type || contest?.status?.type || {};
  const period = Number(event?.status?.period ?? contest?.status?.period ?? 0);
  const statusText = `${type.name || ""} ${type.description || ""} ${type.detail || ""}`.toUpperCase();
  const phase = duration === "PENALTY_SHOOTOUT" || statusText.includes("PENALT") || (status === "IN_PLAY" && period >= 5)
    ? "PENS"
    : statusText.includes("HALFTIME") || (status === "PAUSED" && period <= 2)
      ? "HT"
      : (status === "IN_PLAY" || status === "PAUSED") && (statusText.includes("EXTRA") || period > 2)
        ? "ET"
        : status === "FINISHED"
          ? "FT"
          : null;

  return {
    id: `espn-${competition.id}-${event.id}`,
    sourceId: String(event.id || ""),
    provider: "espn",
    comp: competition.id,
    competition: competitionMeta(competition),
    status,
    utcDate: event.date || contest.date,
    matchday: contest.week?.number ?? null,
    stage: contest.type?.abbreviation || null,
    group: contest.groups?.name || null,
    homeTeam: {
      id: home.team?.id ?? null,
      name: tidyName(home.team?.displayName || home.team?.shortDisplayName || home.team?.name || ""),
    },
    awayTeam: {
      id: away.team?.id ?? null,
      name: tidyName(away.team?.displayName || away.team?.shortDisplayName || away.team?.name || ""),
    },
    score: {
      duration,
      fullTime: { home: homeScore, away: awayScore },
      penalties: { home: homeShootout, away: awayShootout },
    },
    minute: status === "IN_PLAY" ? clock.minute : null,
    injuryTime: status === "IN_PLAY" ? clock.injuryTime : null,
    phase,
    incidents: normaliseEspnIncidents(contest, home.team?.id, away.team?.id),
  };
}

function fixtureName(value) {
  return tidyName(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function sameFixture(primary, enrichment) {
  if (fixtureName(primary?.homeTeam?.name) !== fixtureName(enrichment?.homeTeam?.name)) return false;
  if (fixtureName(primary?.awayTeam?.name) !== fixtureName(enrichment?.awayTeam?.name)) return false;
  const primaryKickOff = new Date(primary?.utcDate || 0).getTime();
  const enrichmentKickOff = new Date(enrichment?.utcDate || 0).getTime();
  return Number.isFinite(primaryKickOff) && Number.isFinite(enrichmentKickOff)
    && Math.abs(primaryKickOff - enrichmentKickOff) <= 30 * 60_000;
}

export function mergeEspnIntoFootballData(footballDataMatches, espnMatches) {
  let enrichedCount = 0;
  const matches = (footballDataMatches || []).map((match) => {
    const enrichment = (espnMatches || []).find((candidate) => sameFixture(match, candidate));
    if (!enrichment) return match;
    enrichedCount += 1;
    return {
      ...match,
      provider: "football-data+espn",
      sourceIds: { footballData: match.sourceId, espn: enrichment.sourceId },
      status: enrichment.status,
      score: enrichment.score,
      minute: enrichment.minute,
      injuryTime: enrichment.injuryTime,
      phase: enrichment.phase,
      incidents: enrichment.incidents,
    };
  });
  return { matches, enrichedCount };
}

export function isLiveStatus(value) {
  const status = String(value || "").toUpperCase();
  return status === "IN_PLAY" || status === "PAUSED" || status === "LIVE";
}

export function cacheTtlForMatches(matches, now = new Date(), liveTtl = 25_000) {
  if ((matches || []).some((match) => isLiveStatus(match.status))) return liveTtl;
  let soonest = Infinity;
  for (const match of matches || []) {
    const status = String(match.status || "").toUpperCase();
    if (status !== "TIMED" && status !== "SCHEDULED") continue;
    const kickOff = new Date(match.utcDate).getTime();
    if (!Number.isFinite(kickOff)) continue;
    const untilKickOff = kickOff - now.getTime();
    if (untilKickOff < 0 && untilKickOff >= -4 * 60 * 60 * 1000) return liveTtl;
    if (untilKickOff >= 0) soonest = Math.min(soonest, untilKickOff);
  }
  if (soonest >= 0 && soonest <= 3 * 60 * 60 * 1000) return 60_000;
  if (soonest >= 0 && soonest <= 24 * 60 * 60 * 1000) return 10 * 60_000;
  return 6 * 60 * 60_000;
}

function expectedMatchMinutes(match) {
  const phase = String(match?.phase || "").toUpperCase();
  const duration = String(match?.score?.duration || "").toUpperCase();
  if (phase === "PENS" || duration === "PENALTY_SHOOTOUT") return 160;
  if (phase === "ET" || duration === "EXTRA_TIME") return 140;
  return 105;
}

function displayHighlightName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isDisplayHighlighted(match, settings, legacyHighlightIds) {
  if ((legacyHighlightIds || []).includes(Number(match?.homeTeam?.id))
    || (legacyHighlightIds || []).includes(Number(match?.awayTeam?.id))) return true;
  const home = displayHighlightName(match?.homeTeam?.name);
  const away = displayHighlightName(match?.awayTeam?.name);
  return (settings.highlightTeams || []).some((name) => {
    const wanted = displayHighlightName(name);
    return wanted && (home === wanted || away === wanted);
  });
}

function displayPriority(match, settings, legacyHighlightIds) {
  const competitionOrder = new Map((settings.competitions || []).map((id, index) => [id, index]));
  const kickOff = new Date(match.utcDate || 0).getTime();
  return {
    highlighted: isDisplayHighlighted(match, settings, legacyHighlightIds),
    competition: competitionOrder.get(match.comp) ?? 999,
    kickOff: Number.isFinite(kickOff) ? kickOff : 0,
  };
}

export function selectDisplayMatches(matches, settings, now = new Date(), forcedLive = false, legacyHighlightIds = []) {
  const nowMs = now.getTime();
  const relevant = [];
  const overdue = [];
  const future = [];
  const scheduled = [];

  for (const match of matches || []) {
    const status = String(match?.status || "").toUpperCase();
    if (!match?.homeTeam || !match?.awayTeam) continue;
    if (status === "TIMED" || status === "SCHEDULED") scheduled.push(match);
    const kickOff = new Date(match?.utcDate || 0).getTime();
    if (!Number.isFinite(kickOff)) continue;
    const minutesFromKickOff = (nowMs - kickOff) / 60_000;
    if (isLiveStatus(status)) relevant.push(match);
    else if (status === "TIMED" || status === "SCHEDULED") {
      if (minutesFromKickOff <= 0 && minutesFromKickOff >= -settings.preMinutes) relevant.push(match);
      else if (minutesFromKickOff > 0 && minutesFromKickOff <= 240) overdue.push(match);
      else if (minutesFromKickOff < 0) future.push(match);
    } else if (status === "FINISHED" && minutesFromKickOff >= 0
      && minutesFromKickOff <= expectedMatchMinutes(match) + settings.postMinutes) relevant.push(match);
  }

  if (forcedLive && relevant.length === 0) {
    return scheduled.sort((left, right) => {
      const a = displayPriority(left, settings, legacyHighlightIds);
      const b = displayPriority(right, settings, legacyHighlightIds);
      if (a.highlighted !== b.highlighted) return a.highlighted ? -1 : 1;
      return a.competition - b.competition || a.kickOff - b.kickOff;
    }).slice(0, settings.maxRows);
  }

  if (future.length) {
    const next = future.reduce((soonest, match) => new Date(match.utcDate) < new Date(soonest.utcDate) ? match : soonest);
    return [...relevant, ...overdue, next];
  }
  return [...relevant, ...overdue];
}

export function compactDisplayMatch(match) {
  const competition = match.competition || {};
  const score = match.score || {};
  return {
    id: match.id,
    comp: match.comp,
    competition: {
      id: competition.id,
      name: competition.name,
      shortName: competition.shortName,
      logo: competition.logo,
    },
    status: match.status,
    utcDate: match.utcDate,
    homeTeam: { id: match.homeTeam?.id ?? null, name: match.homeTeam?.name || "" },
    awayTeam: { id: match.awayTeam?.id ?? null, name: match.awayTeam?.name || "" },
    score: {
      duration: score.duration,
      fullTime: score.fullTime,
      halfTime: score.halfTime,
      penalties: score.penalties,
    },
    minute: match.minute,
    injuryTime: match.injuryTime,
    phase: match.phase,
    incidents: match.incidents,
  };
}

export function matchesTeamName(match, highlightTeams) {
  const names = (highlightTeams || []).map((value) => tidyName(value).toLowerCase());
  const home = tidyName(match?.homeTeam?.name).toLowerCase();
  const away = tidyName(match?.awayTeam?.name).toLowerCase();
  return names.some((name) => name && (home === name || away === name));
}
