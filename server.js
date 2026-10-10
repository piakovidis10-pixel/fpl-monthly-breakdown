const path = require('path');
const express = require('express');
const { buildMonthlyBreakdown } = require('./aggregate');

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_DRAFT_LEAGUE_ID = process.env.FPL_DRAFT_LEAGUE_ID || '60797';
const DEFAULT_CLASSIC_LEAGUE_ID = process.env.FPL_CLASSIC_LEAGUE_ID || '935581';
const DRAFT_API = 'https://draft.premierleague.com/api';
const CLASSIC_API = 'https://fantasy.premierleague.com/api';
const FETCH_CONCURRENCY = 8;
const MAX_ENTRIES = 60; // safety cap so one request can't fan out to hundreds of API calls

const cache = new Map();
function cacheGet(key, ttlMs) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < ttlMs) return hit.value;
  return undefined;
}
function cacheSet(key, value) {
  cache.set(key, { value, time: Date.now() });
}

async function fetchJson(url, apiLabel) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'fpl-monthly-breakdown (github.com/piakovidis10-pixel)' },
  });
  if (!res.ok) {
    const err = new Error(`${apiLabel} API returned ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// A shape mismatch surfaces as a readable error rather than a TypeError.
function expect(value, description, source) {
  if (!value) {
    throw new Error(`Unexpected API response — ${description}. Received keys: ${Object.keys(source).join(', ')}`);
  }
  return value;
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// Draft league (draft.premierleague.com)
// ---------------------------------------------------------------------------

async function getDraftEvents() {
  const cached = cacheGet('draft:events', 30 * 60 * 1000);
  if (cached) return cached;
  const bootstrap = await fetchJson(`${DRAFT_API}/bootstrap-static`, 'Draft');
  const events = expect(bootstrap.events && bootstrap.events.data, 'no events.data in bootstrap-static', bootstrap);
  cacheSet('draft:events', events);
  return events;
}

async function getDraftLeagueDetails(leagueId) {
  const cacheKey = `draft:league:${leagueId}`;
  const cached = cacheGet(cacheKey, 5 * 60 * 1000);
  if (cached) return cached;
  const data = await fetchJson(`${DRAFT_API}/league/${leagueId}/details`, 'Draft');
  cacheSet(cacheKey, data);
  return data;
}

async function getDraftEntryHistory(entryId) {
  const cacheKey = `draft:history:${entryId}`;
  const cached = cacheGet(cacheKey, 5 * 60 * 1000);
  if (cached) return cached;
  const data = await fetchJson(`${DRAFT_API}/entry/${entryId}/history`, 'Draft');
  const history = expect(data.history, `no history in entry ${entryId}'s history response`, data);
  cacheSet(cacheKey, history);
  return history;
}

async function loadDraftBreakdown(leagueId) {
  const [events, details] = await Promise.all([getDraftEvents(), getDraftLeagueDetails(leagueId)]);
  const leagueEntries = expect(details.league_entries, 'no league_entries in league details', details);

  const histories = await mapLimit(leagueEntries, FETCH_CONCURRENCY, async (le) => {
    const history = await getDraftEntryHistory(le.entry_id);
    return [le.entry_id, history];
  });
  const historyByEntry = new Map(histories);

  return buildMonthlyBreakdown({
    events,
    leagueEntries,
    historyByEntry,
    standings: details.standings,
    leagueMeta: details.league,
  });
}

// ---------------------------------------------------------------------------
// Classic league (fantasy.premierleague.com)
// ---------------------------------------------------------------------------

async function getClassicEvents() {
  const cached = cacheGet('classic:events', 30 * 60 * 1000);
  if (cached) return cached;
  const bootstrap = await fetchJson(`${CLASSIC_API}/bootstrap-static/`, 'Classic');
  const events = expect(bootstrap.events, 'no events in bootstrap-static', bootstrap);
  cacheSet('classic:events', events);
  return events;
}

async function getClassicStandings(leagueId) {
  const cacheKey = `classic:league:${leagueId}`;
  const cached = cacheGet(cacheKey, 5 * 60 * 1000);
  if (cached) return cached;

  let page = 1;
  let hasNext = true;
  let leagueMeta = null;
  const results = [];
  while (hasNext) {
    const data = await fetchJson(
      `${CLASSIC_API}/leagues-classic/${leagueId}/standings/?page_standings=${page}`,
      'Classic'
    );
    if (!leagueMeta) leagueMeta = expect(data.league, 'no league in standings response', data);
    const standings = expect(data.standings, 'no standings in standings response', data);
    results.push(...standings.results);
    hasNext = standings.has_next;
    page += 1;
    if (page > 20 || results.length >= MAX_ENTRIES) break; // safety cap
  }

  const result = { league: leagueMeta, results: results.slice(0, MAX_ENTRIES) };
  cacheSet(cacheKey, result);
  return result;
}

async function getClassicEntryHistory(entryId) {
  const cacheKey = `classic:history:${entryId}`;
  const cached = cacheGet(cacheKey, 5 * 60 * 1000);
  if (cached) return cached;
  const data = await fetchJson(`${CLASSIC_API}/entry/${entryId}/history/`, 'Classic');
  const history = expect(data.current, `no current in entry ${entryId}'s history response`, data);
  cacheSet(cacheKey, history);
  return history;
}

async function loadClassicBreakdown(leagueId) {
  const [events, standings] = await Promise.all([getClassicEvents(), getClassicStandings(leagueId)]);

  if (!standings.results.length) {
    const err = new Error('League not found, or it has no entries yet');
    err.status = 404;
    throw err;
  }

  const histories = await mapLimit(standings.results, FETCH_CONCURRENCY, async (entry) => {
    const history = await getClassicEntryHistory(entry.entry);
    return [entry.entry, history];
  });
  const historyByEntry = new Map(histories);

  // Normalized to the same shape aggregate.js already expects from the Draft
  // league: a classic entry has one single id, so it plays both roles.
  const leagueEntries = standings.results.map((r) => ({
    id: r.entry,
    entry_id: r.entry,
    entry_name: r.entry_name,
    player_first_name: r.player_name,
    player_last_name: '',
  }));
  const normalizedStandings = standings.results.map((r) => ({
    league_entry: r.entry,
    rank: r.rank,
    total: r.total,
  }));

  return buildMonthlyBreakdown({
    events,
    leagueEntries,
    historyByEntry,
    standings: normalizedStandings,
    leagueMeta: standings.league,
  });
}

// ---------------------------------------------------------------------------

app.use(express.static(path.join(__dirname, 'public')));

function registerMonthlyRoute(route, { label, defaultLeagueId, load }) {
  app.get(route, async (req, res) => {
    const leagueId = String(req.query.league || defaultLeagueId || '').trim();
    if (!leagueId || !/^\d+$/.test(leagueId)) {
      return res.status(400).json({ error: `Provide a numeric ${label} league id, e.g. ?league=12345` });
    }

    try {
      res.json(await load(leagueId));
    } catch (err) {
      console.error(err);
      if (err.status === 401 || err.status === 403) {
        return res.status(err.status).json({
          error: `This league is private — the ${label} API wants a logged-in session for it`,
          detail: String(err.message),
        });
      }
      const status = err.status === 404 ? 404 : 502;
      res.status(status).json({
        error: status === 404 ? 'League not found' : `Failed to fetch data from the ${label} API`,
        detail: String(err.message || err),
      });
    }
  });
}

registerMonthlyRoute('/api/draft/monthly', {
  label: 'FPL Draft',
  defaultLeagueId: DEFAULT_DRAFT_LEAGUE_ID,
  load: loadDraftBreakdown,
});

registerMonthlyRoute('/api/classic/monthly', {
  label: 'FPL Classic',
  defaultLeagueId: DEFAULT_CLASSIC_LEAGUE_ID,
  load: loadClassicBreakdown,
});

app.listen(PORT, () => {
  console.log(`fpl-monthly-breakdown listening on port ${PORT}`);
});
