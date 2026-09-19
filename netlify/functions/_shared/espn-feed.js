const londonDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function londonDate(date) {
  const parts = londonDateFormatter.formatToParts(date);
  const read = (type) => parts.find((part) => part.type === type)?.value || "01";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

// ESPN no longer accepts a hyphenated date range. A month selector is supported.
// Include the preceding UTC day because an early London fixture may fall in the
// previous ESPN calendar month.
export function espnMonthSelectors(from, to) {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
    throw new Error("Invalid ESPN date window");
  }
  start.setUTCDate(start.getUTCDate() - 1);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const months = [];
  while (cursor <= end) {
    months.push(`${cursor.getUTCFullYear()}${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

export function selectEspnWindowEvents(batches, from, to, limit) {
  const selected = [];
  const seen = new Set();
  for (const events of batches) {
    if (!Array.isArray(events)) throw new Error("ESPN returned an invalid event list");
    if (events.length >= limit) throw new Error(`ESPN event list reached its ${limit}-match limit`);
    for (const event of events) {
      const kickoff = new Date(event?.date || 0);
      if (!Number.isFinite(kickoff.getTime())) continue;
      const date = londonDate(kickoff);
      if (date < from || date > to) continue;
      const id = event?.id == null ? null : String(event.id);
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      selected.push(event);
    }
  }
  return selected;
}

export function isTransientEspnError(error) {
  const message = String(error?.message || error);
  return /^400:.*Failed to get events endpoint/i.test(message) || /^(429|5\d\d):/.test(message);
}

export async function fetchEspnWithRetry(fetchOnce, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  try {
    return await fetchOnce();
  } catch (error) {
    if (!isTransientEspnError(error)) throw error;
    await wait(350);
    return fetchOnce();
  }
}

export function recentEspnSnapshot(cached, now, maxAgeMs = 5 * 60_000) {
  const snapshot = cached?.lastGoodEspn || (cached?.provider === "football-data+espn"
    ? { fetchedAt: cached.fetchedAt, matches: cached.matches }
    : null);
  const age = now.getTime() - new Date(snapshot?.fetchedAt || 0).getTime();
  if (!Array.isArray(snapshot?.matches) || !Number.isFinite(age) || age < 0 || age > maxAgeMs) return null;
  return snapshot;
}
