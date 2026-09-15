# FPL Monthly Breakdown

See which manager in your **FPL Draft** league has actually performed month by
month, rather than only across the season as a whole.

It pulls your league and every manager's gameweek-by-gameweek score from the
public Draft API, groups gameweeks by the calendar month their deadline fell
in, and renders a heatmap: rows are managers, columns are months, each cell
shaded by how that manager's points compare to the rest of the league *that
month*. The month's top scorer gets a trophy badge.

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

## Deploying to Render

`render.yaml` is a Render blueprint, so in Render: **New → Blueprint**, point it
at this repo, and it picks up the build command, start command and default
league on its own. Change the league later under the service's Environment tab
(`FPL_LEAGUE_ID`) — no redeploy needed beyond the automatic restart.

Render assigns the port via `PORT`, which the server already reads. On the free
plan the service sleeps after inactivity, so the first load after a quiet spell
takes around a minute to wake.

## How the numbers work

- Each manager's per-gameweek points come straight from the Draft API's
  `entry/{id}/history` endpoint — the same fully-computed scores (bonus points,
  auto-subs and all) the league itself was decided on, no reimplementing of
  FPL's scoring engine.
- A gameweek belongs to the month its deadline fell in (UTC) — the deadline is
  effectively when the gameweek starts. So a gameweek that spans a weekend
  crossing a month boundary (deadline Friday in August, matches running into
  the following Monday in September) counts *entirely* for the month it
  started in; nothing is split across months.
- Data isn't pushed live — it's fetched on request and cached for 5 minutes
  (30 minutes for gameweek deadline dates, which barely change), so a page
  load is never more than a few minutes stale but nothing updates itself in
  the background while the tab is closed.
- The colour scale is normalized **per month**, not across the whole table —
  that's what makes a strong month visible even for a manager who is mid-table
  overall.
- One request fans out to one `history` call per manager (capped implicitly by
  league size — Draft leagues are small), run with limited concurrency and
  cached for 5 minutes so refreshing the page doesn't re-hammer the API.

## Notes

- The Draft API sends no CORS headers, so the browser can't call it directly —
  hence the small Express backend doing the fetching and caching server-side.
- If a Draft API response shape ever changes, the server reports the keys it
  actually received instead of throwing a generic error.
