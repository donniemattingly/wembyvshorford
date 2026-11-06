# Wemby vs. Horford

[wembyvshorford.com](https://wembyvshorford.com): has Victor Wembanyama caught Al Horford in career win shares?

The site is a [vinext](https://github.com/cloudflare/vinext) App Router app running as the `winshares` Cloudflare Worker.

- `app/page.tsx` renders the page from the stats stored in KV.
- `lib/stats.server.ts` scrapes Basketball Reference and reads/writes the `career-stats:v3` KV key.
- `worker/index.ts` is the Worker entry: it redirects `www`, hands requests to vinext, and runs the daily scrape on the cron trigger (10:15 UTC).
- `public/` holds the highlight film, OG image and other static assets.

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
