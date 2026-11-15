// Looks after the Basketball Reference SQLite cache (scripts/lib/bbref-db.mjs).
//   node scripts/bbref-cache.mjs                       what is cached
//   node scripts/bbref-cache.mjs refresh [table ...]   download the datasets again (all of them by default)
//   node scripts/bbref-cache.mjs import <table> <csv>  load a CSV you downloaded yourself (e.g. from Kaggle)
//   node scripts/bbref-cache.mjs fetch <url> [hours]   any page, through the cache (reused if younger than hours)
//   node scripts/bbref-cache.mjs sql "<query>"         run a query and print the rows
import { readFileSync } from "node:fs";
import { DATASETS, DAY_MS, dataset, datasetUrl, fetchCached, loadCsv, openCache, storeResponse } from "./lib/bbref-db.mjs";

const [command = "status", ...args] = process.argv.slice(2);
const db = openCache();

switch (command) {
  case "status": {
    const loaded = new Map(db.prepare("SELECT * FROM datasets").all().map((d) => [d.name, d]));
    for (const name of Object.keys(DATASETS)) {
      const d = loaded.get(name);
      console.log(d ? `${name.padEnd(20)} ${String(d.rows).padStart(7)} rows, loaded ${d.loaded_at}` : `${name.padEnd(20)} not loaded`);
    }
    const pages = db.prepare("SELECT url, fetched_at, length(body) AS bytes FROM http_cache ORDER BY fetched_at DESC").all();
    console.log(`\n${pages.length} cached responses`);
    for (const p of pages) console.log(`  ${p.fetched_at}  ${String(p.bytes).padStart(9)} B  ${p.url}`);
    break;
  }
  case "refresh":
    for (const name of args.length ? args : Object.keys(DATASETS)) await dataset(db, name, { refresh: true });
    break;
  case "import": {
    const [name, path] = args;
    if (!name || !path) throw new Error("usage: bbref-cache.mjs import <table> <csv>");
    const text = readFileSync(path, "utf8");
    // Stored under the dataset's URL, so a later read-through finds it instead of downloading.
    storeResponse(db, datasetUrl(name), text, { contentType: "text/csv" });
    console.log(`Loaded ${loadCsv(db, name, text)} rows into ${name}`);
    break;
  }
  case "fetch": {
    const [url, hours] = args;
    if (!url) throw new Error("usage: bbref-cache.mjs fetch <url> [hours]");
    const text = await fetchCached(db, url, { maxAgeMs: hours ? (Number(hours) * DAY_MS) / 24 : undefined });
    console.log(`${text.length} characters from ${url}`);
    break;
  }
  case "sql":
    console.table(db.prepare(args.join(" ")).all());
    break;
  default:
    throw new Error(`Unknown command ${command}`);
}
