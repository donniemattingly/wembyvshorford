// Read-through SQLite cache for everything we pull from Basketball Reference, for the offline build scripts.
//
// Two layers, both in one SQLite file (data/bbref.sqlite by default, or $BBREF_CACHE):
//
// - http_cache: raw responses by URL. fetchCached(url) returns the stored body when it is fresh enough and only goes
//   to the network on a miss, then stores what it got. Basketball Reference pages and the CSV downloads both go
//   through it. The Worker keeps the same table in D1 (lib/bbref/fetch.server.ts).
// - One table per sumitrodatta/bball-reference-datasets CSV (advanced, player_totals, team_totals, ...), with the
//   CSV's own column names. dataset(db, name) loads the table from the cached CSV the first time it is asked for, so
//   scripts can query with SQL instead of parsing CSVs.
//
// node scripts/bbref-cache.mjs lists what is cached and refreshes datasets.
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { gunzipSync, gzipSync } from "node:zlib";

export const DEFAULT_PATH = resolve(import.meta.dirname, "../../data/bbref.sqlite");

const USER_AGENT = "wembyvshorford/2.0 (+https://wembyvshorford.com)";
const DATASETS_URL = "https://raw.githubusercontent.com/sumitrodatta/bball-reference-datasets/master/Data";

// Table name -> CSV file name in the datasets repo. Add a line here to make another CSV queryable.
export const DATASETS = {
  advanced: "Advanced.csv",
  player_totals: "Player Totals.csv",
  player_per_game: "Player Per Game.csv",
  player_career_info: "Player Career Info.csv",
  team_totals: "Team Totals.csv",
  opponent_totals: "Opponent Totals.csv",
  team_summaries: "Team Summaries.csv",
  draft_pick_history: "Draft Pick History.csv",
};

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS http_cache (
    url TEXT PRIMARY KEY,
    status INTEGER NOT NULL,
    content_type TEXT,
    encoding TEXT NOT NULL DEFAULT 'gzip',
    body BLOB NOT NULL,
    fetched_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS datasets (
    name TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    rows INTEGER NOT NULL,
    loaded_at TEXT NOT NULL
  );
`;

export const openCache = (path = process.env.BBREF_CACHE || DEFAULT_PATH) => {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The body of url as text, from the cache when it was fetched less than maxAgeMs ago (default: forever, which suits
 * finished seasons and dataset snapshots). Otherwise fetches it, stores it and returns it. Only 200s are stored.
 */
export const fetchCached = async (db, url, { maxAgeMs = Number.POSITIVE_INFINITY, refresh = false } = {}) => {
  const hit = db.prepare("SELECT body, encoding, fetched_at FROM http_cache WHERE url = ?").get(url);
  if (hit && !refresh && Date.now() - Date.parse(hit.fetched_at) < maxAgeMs) return decode(hit);

  let response;
  let text;
  try {
    response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    text = await response.text();
  } catch (error) {
    // A stale copy beats nothing when the source is down or blocks us.
    if (!hit) throw error;
    console.warn(`${error.message}; using the copy from ${hit.fetched_at}`);
    return decode(hit);
  }
  storeResponse(db, url, text, { contentType: response.headers.get("content-type") });
  return text;
};

/** Puts a body in the cache as if it had just been fetched, e.g. a CSV downloaded by hand. */
export const storeResponse = (db, url, text, { contentType = null, fetchedAt = new Date().toISOString() } = {}) => {
  db.prepare(
    `INSERT INTO http_cache (url, status, content_type, encoding, body, fetched_at) VALUES (?, 200, ?, 'gzip', ?, ?)
     ON CONFLICT (url) DO UPDATE SET status = 200, content_type = excluded.content_type, encoding = 'gzip',
       body = excluded.body, fetched_at = excluded.fetched_at`,
  ).run(url, contentType, gzipSync(text), fetchedAt);
};

const decode = ({ body, encoding }) =>
  (encoding === "gzip" ? gunzipSync(body) : Buffer.from(body)).toString("utf8");

export const datasetUrl = (name) => {
  const file = DATASETS[name];
  if (!file) throw new Error(`Unknown dataset ${name}. Known: ${Object.keys(DATASETS).join(", ")}`);
  return `${DATASETS_URL}/${encodeURIComponent(file)}`;
};

// RFC 4180 CSV: quoted cells may hold commas, doubled quotes and newlines.
export const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
};

const quoteIdent = (name) => `"${name.replace(/"/g, '""')}"`;

/** Replaces table `name` with the rows of a CSV. Empty and NA cells become NULL; numbers are stored as numbers. */
export const loadCsv = (db, name, text, url = datasetUrl(name)) => {
  const [header, ...body] = parseCsv(text);
  if (!header?.length) throw new Error(`${name}: CSV is empty`);
  const table = quoteIdent(name);
  db.exec("BEGIN");
  try {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
    // NUMERIC affinity turns "2027" and "0.037" into numbers and leaves names and team codes as text.
    db.exec(`CREATE TABLE ${table} (${header.map((h) => `${quoteIdent(h)} NUMERIC`).join(", ")})`);
    const insert = db.prepare(`INSERT INTO ${table} VALUES (${header.map(() => "?").join(", ")})`);
    for (const r of body) insert.run(...header.map((_, i) => (r[i] === "" || r[i] === "NA" || r[i] == null ? null : r[i])));
    db.prepare(
      "INSERT OR REPLACE INTO datasets (name, url, rows, loaded_at) VALUES (?, ?, ?, ?)",
    ).run(name, url, body.length, new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return body.length;
};

/**
 * Makes sure table `name` is loaded, from the cached CSV or (on a miss) from GitHub. With refresh, downloads the CSV
 * again and reloads the table. Returns the table name, ready to query.
 */
export const dataset = async (db, name, { refresh = false } = {}) => {
  const loaded = db.prepare("SELECT loaded_at FROM datasets WHERE name = ?").get(name);
  if (loaded && !refresh) return name;
  const url = datasetUrl(name);
  const text = await fetchCached(db, url, { refresh });
  const rows = loadCsv(db, name, text, url);
  console.error(`Loaded ${rows} rows into ${name}`);
  return name;
};

/** Opens the cache and loads the named datasets: `const db = await withDatasets("advanced", "team_summaries")`. */
export const withDatasets = async (...names) => {
  const refresh = process.argv.includes("--refresh");
  const db = openCache();
  for (const name of names) await dataset(db, name, { refresh });
  return db;
};

export { DAY_MS };
