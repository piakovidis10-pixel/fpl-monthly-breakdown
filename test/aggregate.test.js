const assert = require('assert');
const { buildMonthlyBreakdown, monthKeyFromDate, monthLabel } = require('../aggregate');

// Two gameweeks in August, one in September, plus an unplayed October gameweek
// (absent from history, since Draft only records gameweeks actually played).
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

const historyByEntry = new Map([
  [100, [
    { event: 1, points: 60, total_points: 60 },
    { event: 2, points: 70, total_points: 130 }, // Aug total: 130
    { event: 3, points: 40, total_points: 170 }, // Sep total: 40
  ]],
  [200, [
    { event: 1, points: 80, total_points: 80 },
    { event: 2, points: 50, total_points: 130 }, // Aug total: 130 (tie)
    { event: 3, points: 90, total_points: 220 }, // Sep total: 90
  ]],
]);

const standings = [
  { league_entry: 1, rank: 2, total: 170 },
  { league_entry: 2, rank: 1, total: 220 },
];

const result = buildMonthlyBreakdown({
  events,
  leagueEntries,
  historyByEntry,
  standings,
  leagueMeta: { id: 60797, name: 'Test League', scoring: 'c' },
});

// Month bucketing — the unplayed October gameweek produces no column
assert.strictEqual(monthKeyFromDate('2024-08-16T17:30:00Z'), '2024-08');
assert.strictEqual(monthLabel('2024-08'), 'Aug 2024');
assert.deepStrictEqual(result.months.map((m) => m.key), ['2024-08', '2024-09']);

// Season totals and sort order (Bob: 220 > Alice: 170)
assert.strictEqual(result.managers[0].entryId, 200);
assert.strictEqual(result.managers[0].seasonPoints, 220);
assert.strictEqual(result.managers[0].leaguePoints, 220);
assert.strictEqual(result.managers[0].leagueRank, 1);
assert.strictEqual(result.managers[1].entryId, 100);
assert.strictEqual(result.managers[1].seasonPoints, 170);

// Monthly aggregation
const alice = result.managers.find((m) => m.entryId === 100);
const bob = result.managers.find((m) => m.entryId === 200);
assert.strictEqual(alice.monthly['2024-08'], 130);
assert.strictEqual(alice.monthly['2024-09'], 40);
assert.strictEqual(bob.monthly['2024-08'], 130);
assert.strictEqual(bob.monthly['2024-09'], 90);

// September winner is Bob (90 > 40); August is a tie, first-seen (Bob, sorted first) wins
assert.strictEqual(result.monthWinners['2024-09'].points, 90);
assert.strictEqual(result.monthWinners['2024-08'].points, 130);

console.log('All aggregate.js tests passed.');
