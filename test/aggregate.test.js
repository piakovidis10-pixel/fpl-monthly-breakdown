const assert = require('assert');
const { buildMonthlyBreakdown, monthKeyFromDate, monthLabel } = require('../aggregate');

// Two gameweeks in August, one in September, plus an unfinished October gameweek
// that must be ignored.
const events = [
  { id: 1, deadline_time: '2024-08-16T17:30:00Z' },
  { id: 2, deadline_time: '2024-08-24T10:00:00Z' },
  { id: 3, deadline_time: '2024-09-14T10:00:00Z' },
  { id: 4, deadline_time: '2024-10-05T10:00:00Z' },
];

const leagueEntries = [
  { id: 1, entry_id: 100, entry_name: 'Alice FC', player_first_name: 'Alice', player_last_name: 'Adams' },
  { id: 2, entry_id: 200, entry_name: 'Bob United', player_first_name: 'Bob', player_last_name: 'Brown' },
];

const matches = [
  { event: 1, finished: true, league_entry_1: 1, league_entry_1_points: 60, league_entry_2: 2, league_entry_2_points: 80 },
  { event: 2, finished: true, league_entry_1: 1, league_entry_1_points: 70, league_entry_2: 2, league_entry_2_points: 50 },
  { event: 3, finished: true, league_entry_1: 1, league_entry_1_points: 40, league_entry_2: 2, league_entry_2_points: 40 },
  { event: 4, finished: false, league_entry_1: 1, league_entry_1_points: 0, league_entry_2: 2, league_entry_2_points: 0 },
];

const standings = [
  { league_entry: 1, rank: 2, total: 4, points_for: 170 },
  { league_entry: 2, rank: 1, total: 4, points_for: 170 },
];

const result = buildMonthlyBreakdown({
  events,
  leagueEntries,
  matches,
  standings,
  leagueMeta: { id: 12345, name: 'Test League', scoring: 'h' },
});

// Month bucketing — the unfinished October gameweek produces no column
assert.strictEqual(monthKeyFromDate('2024-08-16T17:30:00Z'), '2024-08');
assert.strictEqual(monthLabel('2024-08'), 'Aug 2024');
assert.deepStrictEqual(result.months.map((m) => m.key), ['2024-08', '2024-09']);
assert.strictEqual(result.isHeadToHead, true);

const alice = result.managers.find((m) => m.leagueEntryId === 1);
const bob = result.managers.find((m) => m.leagueEntryId === 2);

// Monthly points
assert.strictEqual(alice.monthly['2024-08'].points, 130);
assert.strictEqual(bob.monthly['2024-08'].points, 130);
assert.strictEqual(alice.monthly['2024-09'].points, 40);
assert.strictEqual(bob.monthly['2024-09'].points, 40);

// Monthly H2H records: Aug — Alice lost GW1, won GW2; Sept — drawn
assert.deepStrictEqual(
  { w: alice.monthly['2024-08'].won, d: alice.monthly['2024-08'].drawn, l: alice.monthly['2024-08'].lost },
  { w: 1, d: 0, l: 1 }
);
assert.deepStrictEqual(
  { w: alice.monthly['2024-09'].won, d: alice.monthly['2024-09'].drawn, l: alice.monthly['2024-09'].lost },
  { w: 0, d: 1, l: 0 }
);

// Season totals exclude the unfinished gameweek
assert.strictEqual(alice.seasonPoints, 170);
assert.strictEqual(bob.seasonPoints, 170);
assert.deepStrictEqual(alice.record, { won: 1, drawn: 1, lost: 1 });
assert.deepStrictEqual(bob.record, { won: 1, drawn: 1, lost: 1 });

// Standings are carried through
assert.strictEqual(alice.leagueRank, 2);
assert.strictEqual(bob.leaguePoints, 4);

// Month winners (August is a tie on 130 — first in sorted order wins the badge)
assert.strictEqual(result.monthWinners['2024-08'].points, 130);
assert.strictEqual(result.monthWinners['2024-09'].points, 40);

console.log('All aggregate.js tests passed.');
