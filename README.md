# Wemby vs. Horford

[wembyvshorford.com](https://wembyvshorford.com): has Victor Wembanyama caught Al Horford in career win shares?

The site is a [vinext](https://github.com/cloudflare/vinext) App Router app running as the `winshares` Cloudflare Worker.

- `app/page.tsx` renders the page from the stats stored in KV.
- `lib/stats.server.ts` scrapes Basketball Reference and reads/writes the `career-stats:v3` KV key.
- `worker/index.ts` is the Worker entry: it redirects `www`, hands requests to vinext, and runs the daily scrape on the cron trigger (10:15 UTC).
- `public/` holds the highlight film, OG image and other static assets.

## Projection model

The crossover forecast comes from a comparable-player model in `lib/model/`.

- `history.json` has every NBA and ABA player season since 1960 from Basketball Reference (via [sumitrodatta/bball-reference-datasets](https://github.com/sumitrodatta/bball-reference-datasets)): games, minutes, Win Shares, box plus/minus, plus draft slot and height. Built by `scripts/build-history.mjs`.
- `winShares.ts` finds the players who looked most like a player at the same age, follows what they did next, scales that by how much better or worse he is than each of them, and blends it with a plain aging curve.
- `scripts/backtest.ts` tests the model on past players and tunes its settings (`--tune`). Results go to `backtest.json`.
- `scripts/project.ts` runs the model for Wembanyama and Horford after the last complete season and writes `projection.json`.
- `crossover.ts` runs on each page load: it folds in this season's games and simulates both careers 4,000 times.

`/model` (`app/model/page.tsx`, `components/model/`) shows the work: the comparables, the in-season blend, and the 4,000 simulations run in the browser a batch per frame, with what-if controls for Wembanyama's level, season-to-season noise and Horford's retirement. With the default settings it uses the same seed as the home page, so both show the same numbers.

After each season, download the latest CSVs and rebuild:

```sh
node scripts/build-history.mjs Advanced.csv "Team Summaries.csv" "Draft Pick History.csv" "Player Career Info.csv"
node scripts/backtest.ts --tune
node scripts/project.ts
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
