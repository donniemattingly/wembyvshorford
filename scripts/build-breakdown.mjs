// Builds lib/breakdown/seasons.json: Wembanyama's and Horford's box-score totals for every season, with the team,
// opponent and league totals Win Shares need, and each season's Win Shares split by stat (lib/breakdown/engine.ts).
// The /breakdown page reads it. Rerun after each season, or after changing the engine.
// Reads the player_totals, team_totals and opponent_totals tables of the SQLite cache (scripts/lib/bbref-db.mjs),
// which loads them from https://github.com/sumitrodatta/bball-reference-datasets (scraped from Basketball Reference)
// the first time. Pass --refresh to download the latest CSVs first.
//   node scripts/build-breakdown.mjs [--refresh]
import { writeFileSync } from "node:fs";
import { attribute } from "../lib/breakdown/engine.ts";
import { withDatasets } from "./lib/bbref-db.mjs";

const PLAYERS = { wemby: "wembavi01", horford: "horfoal01" };

const label = (endYear) => `${endYear - 1}-${String(endYear).slice(-2)}`;

// Column names in the CSVs, by the field names lib/breakdown/engine.ts uses.
const FIELDS = { mp: "mp", fg: "fg", fga: "fga", fg3: "x3p", fg3a: "x3pa", ft: "ft", fta: "fta", orb: "orb", drb: "drb",
  ast: "ast", stl: "stl", blk: "blk", tov: "tov", pf: "pf", pts: "pts" };

const box = (row, prefix = "") =>
  Object.fromEntries(
    Object.entries(FIELDS).map(([key, col]) => {
      const cell = row[key === "mp" ? "mp" : prefix + col];
      const value = cell == null ? Number.NaN : Number(cell);
      if (!Number.isFinite(value)) throw new Error(`${row.season} ${row.team}: ${col} is missing`);
      return [key, value];
    }),
  );

const db = await withDatasets("player_totals", "team_totals", "opponent_totals");
const one = (sql, ...params) => db.prepare(sql).get(...params);

const latest = one("SELECT MAX(season) AS season FROM team_totals WHERE lg = 'NBA'").season;
const contexts = {};
const contextFor = (season, abbr) => {
  const key = `${season} ${abbr}`;
  if (contexts[key]) return key;
  const team = one("SELECT * FROM team_totals WHERE lg = 'NBA' AND season = ? AND abbreviation = ? ORDER BY rowid", season, abbr);
  const opp = one("SELECT * FROM opponent_totals WHERE lg = 'NBA' AND season = ? AND abbreviation = ? ORDER BY rowid", season, abbr);
  const league = one("SELECT * FROM team_totals WHERE lg = 'NBA' AND season = ? AND team = 'League Average' ORDER BY rowid", season);
  if (!team || !opp || !league) throw new Error(`No team totals for ${key}`);
  contexts[key] = {
    team: { g: Number(team.g), ...box(team) },
    opp: box(opp, "opp_"),
    league: { g: Number(league.g), ...box(league) },
  };
  return key;
};

// Four decimals is plenty for display and keeps the file small.
const rounded = (value) =>
  typeof value === "number"
    ? Math.round(value * 1e4) / 1e4
    : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rounded(v)]));

const players = {};
for (const [name, id] of Object.entries(PLAYERS)) {
  // One row per team; a traded player's combined rows (2TM, 3TM, TOT) are left out.
  const rows = db
    .prepare(
      `SELECT * FROM player_totals WHERE lg = 'NBA' AND player_id = ? AND team NOT GLOB '[0-9]TM' AND team <> 'TOT'
       ORDER BY season, rowid`,
    )
    .all(id);
  if (rows.length === 0) throw new Error(`${id} is not in player_totals`);
  players[name] = rows.map((r) => {
    const context = contextFor(r.season, r.team);
    const line = box(r);
    return {
      season: label(Number(r.season)),
      team: r.team,
      games: Number(r.g),
      box: line,
      context,
      attribution: rounded(attribute(line, contexts[context], Number(r.g))),
    };
  });
}

const out = { latestSeason: label(latest), players, contexts };
writeFileSync(new URL("../lib/breakdown/seasons.json", import.meta.url), `${JSON.stringify(out)}\n`);
console.log(
  Object.entries(players)
    .map(([name, seasons]) => `${name}: ${seasons.length} team-seasons`)
    .join(", "),
);
