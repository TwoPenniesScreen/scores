// ----------------------------------------------------
// 🔤 TEXT NORMALISER
// ----------------------------------------------------

function normaliseText(str){
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // remove accents
    .replace(/Ø/g, "O")
    .replace(/ø/g, "o")
    .replace(/Æ/g, "AE")
    .replace(/æ/g, "ae")
    .replace(/[-./]/g, " ")
    .toUpperCase()
    .replace(/\s+/g, " ")
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

  // Austria
  "RED BULL SALZBURG": "SALZBURG",

  // Greece
  "PAE OLYMPIAKOS": "OLYMPIAKOS"
};

// ----------------------------------------------------
// 🧱 LENGTH SAFETY (prevents layout breakage)
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
  const stripped = stripCommonWords(normalised);
  const finalName = TEAM_OVERRIDES[stripped] || stripped;

  return enforceMaxLength(finalName);
}
