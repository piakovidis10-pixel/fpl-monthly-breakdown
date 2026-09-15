// Pure aggregation logic, kept free of network/fetch so it can be unit-tested
// without hitting the live FPL Draft API.

function monthKeyFromDate(isoDate) {
  const d = new Date(isoDate);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function tally(bucket, pointsFor, pointsAgainst) {
  bucket.points += pointsFor;
  if (pointsFor > pointsAgainst) bucket.won += 1;
  else if (pointsFor === pointsAgainst) bucket.drawn += 1;
  else bucket.lost += 1;
}

// events        bootstrap-static events ({ id, deadline_time })
// leagueEntries league details "league_entries" ({ id, entry_id, entry_name, player_first_name, player_last_name })
// matches       league details "matches" ({ event, finished, league_entry_1, league_entry_1_points, league_entry_2, league_entry_2_points })
// standings     league details "standings" ({ league_entry, rank, total, points_for })
function buildMonthlyBreakdown({ events, leagueEntries, matches, standings, leagueMeta }) {
  const eventMonth = {};
  for (const e of events) {
    if (e.deadline_time) eventMonth[e.id] = monthKeyFromDate(e.deadline_time);
  }

  const standingsByEntry = new Map();
  for (const s of standings || []) standingsByEntry.set(s.league_entry, s);

  const agg = new Map();
  for (const le of leagueEntries) {
    agg.set(le.id, { monthly: {}, points: 0, won: 0, drawn: 0, lost: 0 });
  }

  function record(leagueEntryId, monthKey, pointsFor, pointsAgainst) {
    const entry = agg.get(leagueEntryId);
    if (!entry) return;
    if (!entry.monthly[monthKey]) {
      entry.monthly[monthKey] = { points: 0, won: 0, drawn: 0, lost: 0 };
    }
    tally(entry.monthly[monthKey], pointsFor, pointsAgainst);
    tally(entry, pointsFor, pointsAgainst);
  }

  const monthKeysSet = new Set();
  for (const m of matches) {
    if (!m.finished) continue; // fixtures for future gameweeks are pre-scheduled with 0 points
    const mk = eventMonth[m.event];
    if (!mk) continue;
    monthKeysSet.add(mk);
    record(m.league_entry_1, mk, m.league_entry_1_points, m.league_entry_2_points);
    record(m.league_entry_2, mk, m.league_entry_2_points, m.league_entry_1_points);
  }

  const monthKeys = Array.from(monthKeysSet).sort();
  const months = monthKeys.map((k) => ({ key: k, label: monthLabel(k) }));

  const managers = leagueEntries.map((le) => {
    const a = agg.get(le.id);
    const standing = standingsByEntry.get(le.id);
    return {
      leagueEntryId: le.id,
      entryId: le.entry_id,
      teamName: le.entry_name,
      managerName: `${le.player_first_name || ''} ${le.player_last_name || ''}`.trim(),
      monthly: a.monthly,
      seasonPoints: a.points,
      record: { won: a.won, drawn: a.drawn, lost: a.lost },
      leaguePoints: standing ? standing.total : null,
      leagueRank: standing ? standing.rank : null,
    };
  });

  managers.sort((x, y) => y.seasonPoints - x.seasonPoints);
  managers.forEach((m, i) => {
    m.pointsRank = i + 1;
  });

  const monthWinners = {};
  for (const mk of monthKeys) {
    let best = null;
    for (const m of managers) {
      const cell = m.monthly[mk];
      if (cell && (best === null || cell.points > best.points)) {
        best = { leagueEntryId: m.leagueEntryId, points: cell.points };
      }
    }
    monthWinners[mk] = best;
  }

  return {
    league: leagueMeta ? { id: leagueMeta.id, name: leagueMeta.name, scoring: leagueMeta.scoring } : null,
    isHeadToHead: Boolean(leagueMeta && leagueMeta.scoring === 'h'),
    months,
    managers,
    monthWinners,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { monthKeyFromDate, monthLabel, buildMonthlyBreakdown };
