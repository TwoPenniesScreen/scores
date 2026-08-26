export const COMPETITIONS = [
  {
    id: "pl",
    legacyCode: "PL",
    name: "Premier League",
    shortName: "Premier League",
    group: "Newcastle competitions",
    espnSlug: "eng.1",
    footballDataCode: "PL",
    logo: "/assets/competitions/premier-league.png",
  },
  {
    id: "fa-cup",
    legacyCode: "FAC",
    name: "FA Cup",
    shortName: "FA Cup",
    group: "Newcastle competitions",
    espnSlug: "eng.fa",
    footballDataCode: null,
    logo: "/assets/competitions/fa-cup.png",
  },
  {
    id: "league-cup",
    legacyCode: "LC",
    name: "Carabao Cup",
    shortName: "Carabao Cup",
    group: "Newcastle competitions",
    espnSlug: "eng.league_cup",
    footballDataCode: null,
    logo: "/assets/competitions/league-cup.png",
  },
  {
    id: "champions-league",
    legacyCode: "CL",
    name: "UEFA Champions League",
    shortName: "Champions League",
    group: "Newcastle competitions",
    espnSlug: "uefa.champions",
    footballDataCode: "CL",
    logo: "/assets/competitions/champions-league.png",
  },
  {
    id: "europa-league",
    legacyCode: "EL",
    name: "UEFA Europa League",
    shortName: "Europa League",
    group: "Newcastle competitions",
    espnSlug: "uefa.europa",
    footballDataCode: null,
    logo: "/assets/competitions/europa-league.png",
  },
  {
    id: "conference-league",
    legacyCode: "ECL",
    name: "UEFA Conference League",
    shortName: "Conference League",
    group: "Newcastle competitions",
    espnSlug: "uefa.europa.conf",
    footballDataCode: null,
    logo: "/assets/competitions/conference-league.png",
  },
  {
    id: "community-shield",
    legacyCode: "CS",
    name: "FA Community Shield",
    shortName: "Community Shield",
    group: "Newcastle competitions",
    espnSlug: "eng.charity",
    footballDataCode: null,
    logo: null,
  },
  {
    id: "uefa-super-cup",
    legacyCode: "USC",
    name: "UEFA Super Cup",
    shortName: "UEFA Super Cup",
    group: "Newcastle competitions",
    espnSlug: "uefa.super_cup",
    footballDataCode: null,
    logo: "/assets/competitions/uefa-super-cup.png",
  },
  {
    id: "club-world-cup",
    legacyCode: "CWC",
    name: "FIFA Club World Cup",
    shortName: "Club World Cup",
    group: "Newcastle competitions",
    espnSlug: "fifa.cwc",
    footballDataCode: null,
    logo: "/assets/competitions/club-world-cup.png",
  },
  {
    id: "world-cup",
    legacyCode: "WC",
    name: "FIFA World Cup",
    shortName: "World Cup",
    group: "England competitions",
    espnSlug: "fifa.world",
    footballDataCode: "WC",
    logo: null,
  },
  {
    id: "world-cup-qualifiers",
    legacyCode: "WCQ",
    name: "FIFA World Cup Qualifying — UEFA",
    shortName: "World Cup Qualifying",
    group: "England competitions",
    espnSlug: "fifa.worldq.uefa",
    footballDataCode: null,
    logo: null,
  },
  {
    id: "euros",
    legacyCode: "EC",
    name: "UEFA European Championship",
    shortName: "European Championship",
    group: "England competitions",
    espnSlug: "uefa.euro",
    footballDataCode: "EC",
    logo: null,
  },
  {
    id: "euro-qualifiers",
    legacyCode: "ECQ",
    name: "UEFA European Championship Qualifying",
    shortName: "European Qualifying",
    group: "England competitions",
    espnSlug: "uefa.euroq",
    footballDataCode: null,
    logo: null,
  },
  {
    id: "nations-league",
    legacyCode: "UNL",
    name: "UEFA Nations League",
    shortName: "Nations League",
    group: "England competitions",
    espnSlug: "uefa.nations",
    footballDataCode: null,
    logo: null,
  },
  {
    id: "friendlies",
    legacyCode: "INT",
    name: "International Friendly",
    shortName: "International Friendly",
    group: "England competitions",
    espnSlug: "fifa.friendly",
    footballDataCode: null,
    logo: null,
  },
];

export const COMPETITION_BY_ID = new Map(COMPETITIONS.map((competition) => [competition.id, competition]));

const aliases = new Map();
for (const competition of COMPETITIONS) {
  aliases.set(competition.id.toLowerCase(), competition.id);
  aliases.set(competition.legacyCode.toLowerCase(), competition.id);
  if (competition.footballDataCode) aliases.set(competition.footballDataCode.toLowerCase(), competition.id);
}

export function resolveCompetition(value) {
  return COMPETITION_BY_ID.get(aliases.get(String(value || "").trim().toLowerCase())) || null;
}

export function normaliseCompetitionIds(values) {
  const output = [];
  const seen = new Set();
  for (const value of values || []) {
    const competition = resolveCompetition(value);
    if (!competition || seen.has(competition.id)) continue;
    seen.add(competition.id);
    output.push(competition.id);
  }
  return output;
}

export const DEFAULT_SETTINGS = Object.freeze({
  version: 1,
  sourceMode: "hybrid",
  competitions: COMPETITIONS.map(({ id }) => id),
  maxRows: 5,
  preMinutes: 60,
  postMinutes: 120,
  maxBoards: 2,
  showCompetitionLogo: true,
  highlightTeams: ["Newcastle", "England"],
});

export function sanitiseSettings(input = {}) {
  const sourceMode = ["hybrid", "espn", "football-data"].includes(input.sourceMode)
    ? input.sourceMode
    : DEFAULT_SETTINGS.sourceMode;
  const competitionIds = normaliseCompetitionIds(
    Array.isArray(input.competitions) ? input.competitions : DEFAULT_SETTINGS.competitions,
  );
  const clamp = (value, fallback, min, max) => {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };
  const highlightTeams = Array.isArray(input.highlightTeams)
    ? input.highlightTeams.map((name) => String(name || "").trim()).filter(Boolean).slice(0, 12)
    : [...DEFAULT_SETTINGS.highlightTeams];

  return {
    version: 1,
    sourceMode,
    competitions: competitionIds.length ? competitionIds : [...DEFAULT_SETTINGS.competitions],
    maxRows: clamp(input.maxRows, DEFAULT_SETTINGS.maxRows, 1, 8),
    preMinutes: clamp(input.preMinutes, DEFAULT_SETTINGS.preMinutes, 0, 2880),
    postMinutes: clamp(input.postMinutes, DEFAULT_SETTINGS.postMinutes, 0, 720),
    maxBoards: clamp(input.maxBoards, DEFAULT_SETTINGS.maxBoards, 1, 2),
    showCompetitionLogo: input.showCompetitionLogo !== false,
    highlightTeams,
  };
}

export function publicCompetition(competition) {
  return {
    id: competition.id,
    code: competition.legacyCode,
    name: competition.name,
    shortName: competition.shortName,
    group: competition.group,
    logo: competition.logo,
    sources: {
      espn: Boolean(competition.espnSlug),
      footballData: Boolean(competition.footballDataCode),
    },
  };
}
