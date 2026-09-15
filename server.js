const path = require('path');
const express = require('express');
const { buildMonthlyBreakdown } = require('./aggregate');

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_LEAGUE_ID = process.env.FPL_LEAGUE_ID || '60797';
const DRAFT_API = 'https://draft.premierleague.com/api';
const FETCH_CONCURRENCY = 8;

const cache = new Map();
function cacheGet(key, ttlMs) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < ttlMs) return hit.value;
  return undefined;
}
function cacheSet(key, value) {
  cache.set(key, { value, time: Date.now() });
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'fpl-monthly-breakdown (github.com/piakovidis10-pixel)' },
  });
  if (!res.ok) {
    const err = new Error(`Draft API returned ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// The Draft API is only reachable from a machine with internet access, so a
// shape mismatch surfaces as a readable error rather than a TypeError.
function expect(value, description, source) {
  if (!value) {
    throw new Error(`Unexpected Draft API response — ${description}. Received keys: ${Object.keys(source).join(', ')}`);
  }
  return value;
}

async function getEvents() {
  const cached = cacheGet('events', 30 * 60 * 1000);
  if (cached) return cached;
  const bootstrap = await fetchJson(`${DRAFT_API}/bootstrap-static`);
  const events = expect(bootstrap.events && bootstrap.events.data, 'no events.data in bootstrap-static', bootstrap);
  cacheSet('events', events);
  return events;
}

async function getLeagueDetails(leagueId) {
  const cacheKey = `league:${leagueId}`;
  const cached = cacheGet(cacheKey, 5 * 60 * 1000);
  if (cached) return cached;
  const data = await fetchJson(`${DRAFT_API}/league/${leagueId}/details`);
  cacheSet(cacheKey, data);
  return data;
}

async function getEntryHistory(entryId) {
  const cacheKey = `history:${entryId}`;
  const cached = cacheGet(cacheKey, 5 * 60 * 1000);
  if (cached) return cached;
  const data = await fetchJson(`${DRAFT_API}/entry/${entryId}/history`);
  const history = expect(data.history, `no history in entry ${entryId}'s history response`, data);
  cacheSet(cacheKey, history);
  return history;
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

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/monthly', async (req, res) => {
  const leagueId = String(req.query.league || DEFAULT_LEAGUE_ID || '').trim();
  if (!leagueId || !/^\d+$/.test(leagueId)) {
    return res.status(400).json({ error: 'Provide a numeric FPL Draft league id, e.g. ?league=12345' });
  }

  try {
    const [events, details] = await Promise.all([getEvents(), getLeagueDetails(leagueId)]);
    const leagueEntries = expect(details.league_entries, 'no league_entries in league details', details);

    const histories = await mapLimit(leagueEntries, FETCH_CONCURRENCY, async (le) => {
      const history = await getEntryHistory(le.entry_id);
      return [le.entry_id, history];
    });
    const historyByEntry = new Map(histories);

    res.json(
      buildMonthlyBreakdown({
        events,
        leagueEntries,
        historyByEntry,
        standings: details.standings,
        leagueMeta: details.league,
      })
    );
  } catch (err) {
    console.error(err);
    if (err.status === 401 || err.status === 403) {
      return res.status(err.status).json({
        error: 'This league is private — the Draft API wants a logged-in session for it',
        detail: String(err.message),
      });
    }
    const status = err.status === 404 ? 404 : 502;
    res.status(status).json({
      error: status === 404 ? 'League not found' : 'Failed to fetch data from the FPL Draft API',
      detail: String(err.message || err),
    });
  }
});

app.listen(PORT, () => {
  console.log(`fpl-monthly-breakdown listening on port ${PORT}`);
});
