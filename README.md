# Wemby vs. Horford

[wembyvshorford.com](https://wembyvshorford.com): has Victor Wembanyama caught Al Horford in career win shares?

The site is a [vinext](https://github.com/cloudflare/vinext) App Router app running as the `winshares` Cloudflare Worker.

- `app/page.tsx` renders the page from the stats stored in KV.
- `lib/stats.server.ts` scrapes Basketball Reference and reads/writes the `career-stats:v3` KV key.
- `worker/index.ts` is the Worker entry: it redirects `www`, hands requests to vinext, and runs the daily scrape on the cron trigger (10:15 UTC).
- `public/` holds the highlight film, the share-card fonts and other static assets.
- `lib/og/` draws the share card (`/og.png`) from the live numbers with resvg. Pages link it as `/og.png?v=<wemby>-<horford>`, so the URL changes whenever the numbers do and link previews (Discord, Slack, iMessage) fetch a fresh image.

## Projection model

The crossover forecast comes from a comparable-player model in `lib/model/`.

- `history.json` has every NBA and ABA player season since 1960 from Basketball Reference (via [sumitrodatta/bball-reference-datasets](https://github.com/sumitrodatta/bball-reference-datasets)): games, minutes, Win Shares, box plus/minus, plus draft slot and height. Built by `scripts/build-history.mjs`.
- `winShares.ts` finds the players who looked most like a player at the same age, follows what they did next, scales that by how much better or worse he is than each of them, and blends it with a plain aging curve.
- `scripts/backtest.ts` tests the model on past players and tunes its settings (`--tune`). Results go to `backtest.json`.
- `scripts/project.ts` runs the model for Wembanyama and Horford after the last complete season and writes `projection.json`.
- `crossover.ts` runs on each page load: it folds in this season's games and simulates both careers 4,000 times.

`/model` (`app/model/page.tsx`, `components/model/`) shows the work: the comparables, the in-season blend, and the 4,000 simulations run in the browser a batch per frame, with what-if controls for Wembanyama's level, season-to-season noise and Horford's retirement. With the default settings it uses the same seed as the home page, so both show the same numbers.

After each season, rebuild with the latest data (`--refresh` downloads fresh CSVs into the SQLite cache, below):

```sh
node scripts/build-history.mjs --refresh
node scripts/backtest.ts --tune
node scripts/project.ts
```

## Stat breakdown

`/breakdown` splits each player's Win Shares by stat, for a career, any season, or any game this season.

- `lib/breakdown/engine.ts` rebuilds Basketball Reference's Offensive and Defensive Win Shares from a box-score line plus team, opponent and league totals (it matches their numbers to the tenth), and splits them across the stats with Aumann-Shapley attribution, so the parts add up exactly. The defensive credit for minutes on the floor gets its own row.
- `lib/breakdown/seasons.json` holds every finished season's totals and breakdown. Rebuild it after each season (and after any engine change) from the same CSV source:

```sh
node scripts/build-breakdown.mjs --refresh
```

- The daily scrape (and a visit to `/` or `/breakdown` when it is more than a day old) reads this season's totals from each player's page and the team totals from the league page (`lib/breakdown/live.server.ts`, KV key `breakdown-live:v1`). The parsers look for the season row with whole-number stats rather than trusting one table id. When the league page can't be read, or the Win Shares rebuilt from it miss the ones Basketball Reference lists, the line is measured against the team's last full season and calibrated to the listed offensive and defensive Win Shares (`calibrate()` in the engine), so the season in progress always shows and always totals correctly. Game logs are kept only if they add up to the season totals. Each run's outcome per player is in KV under `breakdown-status:v1` (`npx wrangler kv key get breakdown-status:v1 --binding VINEXT_KV_CACHE --remote --config dist/server/wrangler.json`). The page says "through N of M games" when it trails Basketball Reference.
- `components/breakdown/ContributionChart.tsx` draws any two breakdowns side by side, which is what makes it work for careers, seasons and games alike.

## Basketball Reference cache

Everything pulled from Basketball Reference goes through a read-through SQLite cache: look in SQLite first, and only fetch (then store) on a miss. Code reads from SQLite rather than CSVs.

- **Offline** (`scripts/lib/bbref-db.mjs`, Node's built-in `node:sqlite`, no dependencies). The file is `data/bbref.sqlite` (git-ignored), or wherever `BBREF_CACHE` points. `http_cache` holds raw responses by URL. Each [sumitrodatta/bball-reference-datasets](https://github.com/sumitrodatta/bball-reference-datasets) CSV becomes a table with the CSV's column names (`advanced`, `player_totals`, `team_totals`, `opponent_totals`, `team_summaries`, `draft_pick_history`, `player_career_info`, `player_per_game`), loaded the first time a script asks for it. The build scripts query those tables.
- **Worker** (`lib/bbref/fetch.server.ts`). `fetchBbref(url)` is the only way the Worker reads Basketball Reference (player pages, the league page, game logs). It keeps the same `http_cache` table in D1, reuses a copy for 6 hours, and falls back to the last copy if the site fails. Until the `BBREF_DB` binding exists it is a plain fetch. To turn it on, create the database and add the binding to `wrangler.jsonc`:

  ```sh
  npx wrangler d1 create bbref
  # then in wrangler.jsonc: "d1_databases": [{ "binding": "BBREF_DB", "database_name": "bbref", "database_id": "<id it printed>" }]
  ```

```sh
node scripts/bbref-cache.mjs                        # what is cached
node scripts/bbref-cache.mjs refresh [table ...]    # download datasets again
node scripts/bbref-cache.mjs import player_totals ~/Downloads/"Player Totals.csv"   # a CSV you downloaded yourself
node scripts/bbref-cache.mjs fetch <url> [hours]    # any page, through the cache
node scripts/bbref-cache.mjs sql "SELECT season, ws FROM advanced WHERE player_id = 'wembavi01'"
```

## Develop

```sh
npm install
npm run dev        # Vite dev server
npm run build      # production build into dist/
npm run preview    # run the built Worker locally with Wrangler
```

Locally the KV namespace is empty, so the page shows the built-in fallback stats. To use real data, seed it:

```sh
npx wrangler kv key put 'career-stats:v3' --binding VINEXT_KV_CACHE --path career-stats.json --local --config dist/server/wrangler.json
```

## Deploy

Pushes to `main` build and deploy through `.github/workflows/deploy.yml`, which needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets. To deploy by hand: `npm run build && npx wrangler deploy --config dist/server/wrangler.json`.
