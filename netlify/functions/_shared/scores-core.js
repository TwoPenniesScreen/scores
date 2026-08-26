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

export function normaliseFootballData(match, competition) {
  return {
    id: `fd-${match.id}`,
    sourceId: String(match.id || ""),
    provider: "football-data",
    comp: competition.id,
    competition: competitionMeta(competition),
    status: String(match.status || "SCHEDULED").toUpperCase(),
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
  };
}

export function isLiveStatus(value) {
  const status = String(value || "").toUpperCase();
  return status === "IN_PLAY" || status === "PAUSED" || status === "LIVE";
}

export function cacheTtlForMatches(matches, now = new Date()) {
  if ((matches || []).some((match) => isLiveStatus(match.status))) return 25_000;
  let soonest = Infinity;
  for (const match of matches || []) {
    const status = String(match.status || "").toUpperCase();
    if (status !== "TIMED" && status !== "SCHEDULED") continue;
    const kickOff = new Date(match.utcDate).getTime();
    if (!Number.isFinite(kickOff)) continue;
    soonest = Math.min(soonest, kickOff - now.getTime());
  }
  if (soonest >= 0 && soonest <= 3 * 60 * 60 * 1000) return 60_000;
  if (soonest >= 0 && soonest <= 24 * 60 * 60 * 1000) return 10 * 60_000;
  return 6 * 60 * 60_000;
}

export function matchesTeamName(match, highlightTeams) {
  const names = (highlightTeams || []).map((value) => tidyName(value).toLowerCase());
  const home = tidyName(match?.homeTeam?.name).toLowerCase();
  const away = tidyName(match?.awayTeam?.name).toLowerCase();
  return names.some((name) => name && (home === name || away === name));
}
