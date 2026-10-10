# FPL Monthly Breakdown

See which manager has actually performed month by month, rather than only
across the season as a whole — for both your **FPL Draft** league and your
**FPL Classic** (the regular/main game) league, as two tabs in one page.

It pulls the league and every manager's gameweek-by-gameweek score from the
relevant public FPL API, groups gameweeks by the calendar month their deadline
fell in, and renders a heatmap: rows are managers, columns are months, each
cell coloured by that manager's rank within the league *that month* — green
for the month's top scorer, red for the bottom two, neutral for everyone
else. A "Rank teams by" dropdown re-sorts the table by any single month
instead of always by season total.

## Running it

```bash
npm install
npm start
```

Then open `http://localhost:3000`. Each tab defaults to its own league —
Draft **60797**, Classic **935581** — overridable with `FPL_DRAFT_LEAGUE_ID`
/ `FPL_CLASSIC_LEAGUE_ID`, with `?draftLeague=<id>` / `?classicLeague=<id>` in
the URL, or by typing an ID into that tab's form. Each league ID is in its
own URL:
- Draft: `draft.premierleague.com/league/<id>/standings`
- Classic: `fantasy.premierleague.com/leagues/<id>/standings/c`

```bash
npm test   # aggregation logic, no network needed
```

## Deploying to Render

`render.yaml` is a Render blueprint, so in Render: **New → Blueprint**, point it
at this repo, and it picks up the build command, start command and both
default leagues on its own. Change either league later under the service's
Environment tab (`FPL_DRAFT_LEAGUE_ID` / `FPL_CLASSIC_LEAGUE_ID`) — no
redeploy needed beyond the automatic restart.

Render assigns the port via `PORT`, which the server already reads. On the free
plan the service sleeps after inactivity, so the first load after a quiet spell
takes around a minute to wake.

## How the numbers work

- Each manager's per-gameweek points come straight from the relevant API's
  entry-history endpoint — the same fully-computed scores (bonus points,
  auto-subs and all) the league itself was decided on, no reimplementing of
  FPL's scoring engine. Draft and Classic are separate games with separate
  APIs, league IDs and entry IDs, normalized server-side into one common shape
  before the two tabs share the exact same aggregation and rendering code.
- A gameweek belongs to the month its deadline fell in (UTC) — the deadline is
  effectively when the gameweek starts. So a gameweek that spans a weekend
  crossing a month boundary (deadline Friday in August, matches running into
  the following Monday in September) counts *entirely* for the month it
  started in; nothing is split across months.
- Data isn't pushed live — it's fetched on request and cached for 5 minutes
  (30 minutes for gameweek deadline dates, which barely change), so a page
  load is never more than a few minutes stale but nothing updates itself in
  the background while the tab is closed.
- One request fans out to one history call per manager (capped at 60 entries,
  well above any real mini-league), run with limited concurrency and cached so
  refreshing the page doesn't re-hammer either API.

## Notes

- Neither FPL API sends CORS headers, so the browser can't call them directly —
  hence the small Express backend doing the fetching and caching server-side.
- If a response shape from either API ever changes, the server reports the
  keys it actually received instead of throwing a generic error.
- Both tabs' endpoints (`entry/history` shape, `leagues-classic/standings`
  shape, bootstrap-static's `events`) were verified against real API responses
  during development, not just documentation — including the classic league's
  own real standings and gameweek history.
