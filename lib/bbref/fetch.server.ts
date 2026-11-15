// Every Basketball Reference page the Worker reads goes through fetchBbref, a read-through cache in D1 (Cloudflare's
// SQLite). It returns the stored copy when it is younger than maxAgeMs, and otherwise fetches the page, stores it
// and returns it. The table matches the offline cache in scripts/lib/bbref-db.mjs, so `wrangler d1 export` output
// drops straight into data/bbref.sqlite.
//
// The cache is used only when the BBREF_DB binding exists (see the README). Without it this is a plain fetch, so
// nothing breaks before the database is created.
import { env } from "cloudflare:workers";

const USER_AGENT = "wembyvshorford/2.0 (+https://wembyvshorford.com)";

const HOUR_MS = 60 * 60 * 1000;

/** Pages for the season in progress change after every game, so by default a copy is reused for a few hours. */
export const LIVE_MAX_AGE_MS = 6 * HOUR_MS;

const database = (): D1Database | undefined => (env as { BBREF_DB?: D1Database }).BBREF_DB;

let schemaReady: Promise<unknown> | null = null;
const ensureSchema = (db: D1Database) =>
  (schemaReady ??= db
    .prepare(
      `CREATE TABLE IF NOT EXISTS http_cache (
        url TEXT PRIMARY KEY,
        status INTEGER NOT NULL,
        content_type TEXT,
        encoding TEXT NOT NULL DEFAULT 'gzip',
        body BLOB NOT NULL,
        fetched_at TEXT NOT NULL
      )`,
    )
    .run()
    .catch((error) => {
      schemaReady = null;
      throw error;
    }));

// Pages are stored gzipped: a player page is several hundred KB of HTML and D1 caps a value at 2 MB.
const gzip = async (text: string) =>
  new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());

const gunzip = async (bytes: ArrayBuffer | Uint8Array | number[]) =>
  new Response(new Blob([bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"))).text();

type Row = { body: ArrayBuffer | number[]; encoding: string; fetched_at: string };

const read = async (db: D1Database, url: string): Promise<{ text: string; fetchedAt: string } | null> => {
  const row = await db.prepare("SELECT body, encoding, fetched_at FROM http_cache WHERE url = ?").bind(url).first<Row>();
  if (!row) return null;
  const text = row.encoding === "gzip" ? await gunzip(row.body) : new TextDecoder().decode(new Uint8Array(row.body));
  return { text, fetchedAt: row.fetched_at };
};

const write = async (db: D1Database, url: string, text: string, contentType: string | null) => {
  await db
    .prepare(
      `INSERT INTO http_cache (url, status, content_type, encoding, body, fetched_at) VALUES (?, 200, ?, 'gzip', ?, ?)
       ON CONFLICT (url) DO UPDATE SET status = 200, content_type = excluded.content_type, encoding = 'gzip',
         body = excluded.body, fetched_at = excluded.fetched_at`,
    )
    .bind(url, contentType, await gzip(text), new Date().toISOString())
    .run();
};

/**
 * A Basketball Reference page's HTML, from the cache when it is younger than maxAgeMs, otherwise from the site
 * (and then stored). If the site fails and a stale copy exists, the stale copy is returned. Cache errors never
 * fail the fetch.
 */
export const fetchBbref = async (url: string, { maxAgeMs = LIVE_MAX_AGE_MS } = {}): Promise<string> => {
  const db = database();
  let cached: { text: string; fetchedAt: string } | null = null;
  if (db) {
    try {
      await ensureSchema(db);
      cached = await read(db, url);
      if (cached && Date.now() - Date.parse(cached.fetchedAt) < maxAgeMs) return cached.text;
    } catch (error) {
      console.error("Basketball Reference cache read failed", error);
    }
  }

  let response: Response;
  let text: string;
  try {
    response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    if (!response.ok) throw new Error(`Basketball Reference returned ${response.status} for ${url}`);
    text = await response.text();
  } catch (error) {
    if (!cached) throw error;
    console.error(`${error instanceof Error ? error.message : error}; using the copy from ${cached.fetchedAt}`);
    return cached.text;
  }
  if (db) {
    try {
      await write(db, url, text, response.headers.get("content-type"));
    } catch (error) {
      console.error("Basketball Reference cache write failed", error);
    }
  }
  return text;
};
