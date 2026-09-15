# FPL Monthly Breakdown

See which manager in your **FPL Draft** league has actually performed month by
month, rather than only across the season as a whole.

It pulls your league from the public Draft API, groups gameweeks by the calendar
month their deadline fell in, and renders a heatmap: rows are managers, columns
are months, each cell shaded by how that manager's points compare to the rest of
the league *that month*. The month's top scorer gets a trophy badge.

For head-to-head leagues each cell also carries that month's W-D-L, with season
`Record` and `Lg pts` columns at the end — so you can see who scored heaviest
versus who actually banked the league points.

## Running it

```bash
npm install
npm start
```

Then open `http://localhost:3000`. It defaults to league **60797**; override it
with `FPL_LEAGUE_ID=<id>`, with `?league=<id>` in the URL, or by typing an ID
into the page. Your league ID is in its URL:
`draft.premierleague.com/league/<id>/standings`.

```bash
npm test   # aggregation logic, no network needed
```

## How the numbers work

- Points come from the league's own `matches`, so they're the scores the league
  was actually decided on.
- Only **finished** gameweeks count. Draft schedules every fixture up front, so
  counting unfinished ones would pull a month's average down with zeroes.
- A gameweek belongs to the month its deadline fell in (UTC), so a gameweek that
  kicks off in one month and finishes in the next counts for the month it
  started.
- The colour scale is normalized **per month**, not across the whole table —
  that's what makes a strong month visible even for a manager who is mid-table
  overall.

## Notes

- Built against the Draft API's documented shapes but **not run against the live
  API** — the sandbox it was written in had no outbound access to
  `draft.premierleague.com`. The aggregation logic is unit-tested and the UI was
  rendered against mocked responses; if a response shape differs, the server
  reports what it actually received instead of throwing.
- The Draft API sends no CORS headers, so the browser can't call it directly.
  Hence the small Express backend, which also caches (30 min for gameweek
  metadata, 5 min for league data) to stay polite.
