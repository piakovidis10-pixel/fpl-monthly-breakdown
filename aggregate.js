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

// events         bootstrap-static "events" array ({ id, deadline_time })
// leagueEntries  league details "league_entries" ({ id, entry_id, entry_name, player_first_name, player_last_name })
// historyByEntry Map<entry_id, entry-history "history" array ({ event, points })>
// standings      league details "standings" ({ league_entry, rank, total })
function buildMonthlyBreakdown({ events, leagueEntries, historyByEntry, standings, leagueMeta }) {
  const eventMonth = {};
  for (const e of events) {
    if (e.deadline_time) eventMonth[e.id] = monthKeyFromDate(e.deadline_time);
  }

  const standingsByEntry = new Map();
  for (const s of standings || []) standingsByEntry.set(s.league_entry, s);

  const monthKeysSet = new Set();
  const managers = leagueEntries.map((le) => {
    const history = historyByEntry.get(le.entry_id) || [];
    const monthly = {};
    for (const gw of history) {
      const mk = eventMonth[gw.event];
      if (!mk) continue;
      monthKeysSet.add(mk);
      monthly[mk] = (monthly[mk] || 0) + gw.points;
    }
    const seasonPoints = history.reduce((s, g) => s + g.points, 0);
    const standing = standingsByEntry.get(le.id);
    return {
      leagueEntryId: le.id,
      entryId: le.entry_id,
      teamName: le.entry_name,
      managerName: `${le.player_first_name || ''} ${le.player_last_name || ''}`.trim(),
      monthly,
      seasonPoints,
      leaguePoints: standing ? standing.total : null,
      leagueRank: standing ? standing.rank : null,
    };
  });

  const monthKeys = Array.from(monthKeysSet).sort();
  const months = monthKeys.map((k) => ({ key: k, label: monthLabel(k) }));

  managers.sort((x, y) => y.seasonPoints - x.seasonPoints);
  managers.forEach((m, i) => {
    m.pointsRank = i + 1;
  });

  const monthWinners = {};
  for (const mk of monthKeys) {
    let best = null;
    for (const m of managers) {
      const v = m.monthly[mk];
      if (v != null && (best === null || v > best.points)) {
        best = { leagueEntryId: m.leagueEntryId, points: v };
      }
    }
    monthWinners[mk] = best;
  }

  return {
    league: leagueMeta ? { id: leagueMeta.id, name: leagueMeta.name, scoring: leagueMeta.scoring } : null,
    months,
    managers,
    monthWinners,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { monthKeyFromDate, monthLabel, buildMonthlyBreakdown };
