// Builds lib/breakdown/seasons.json: Wembanyama's and Horford's box-score totals for every season, with the team,
// opponent and league totals Win Shares need, and each season's Win Shares split by stat (lib/breakdown/engine.ts).
// The /breakdown page reads it. Rerun after each season, or after changing the engine.
// Inputs are the Player Totals.csv, Team Totals.csv and Opponent Totals.csv files from
// https://github.com/sumitrodatta/bball-reference-datasets (scraped from Basketball Reference).
//   node scripts/build-breakdown.mjs "Player Totals.csv" "Team Totals.csv" "Opponent Totals.csv"
import { readFileSync, writeFileSync } from "node:fs";
import { attribute } from "../lib/breakdown/engine.ts";

const [playersPath, teamsPath, oppPath] = process.argv.slice(2);
if (!oppPath) {
  throw new Error("usage: build-breakdown.mjs 'Player Totals.csv' 'Team Totals.csv' 'Opponent Totals.csv'");
}

const PLAYERS = { wemby: "wembavi01", horford: "horfoal01" };

const parseCsv = (text) => {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const cells = [];
    let cell = "";
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) {
        cells.push(cell);
        cell = "";
      } else cell += ch;
    }
    cells.push(cell);
    rows.push(cells);
  }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
};

const label = (endYear) => `${endYear - 1}-${String(endYear).slice(-2)}`;

// Column names in the CSVs, by the field names lib/breakdown/engine.ts uses.
const FIELDS = { mp: "mp", fg: "fg", fga: "fga", fg3: "x3p", fg3a: "x3pa", ft: "ft", fta: "fta", orb: "orb", drb: "drb",
  ast: "ast", stl: "stl", blk: "blk", tov: "tov", pf: "pf", pts: "pts" };

const box = (row, prefix = "") =>
  Object.fromEntries(
    Object.entries(FIELDS).map(([key, col]) => {
      const value = Number(row[key === "mp" ? "mp" : prefix + col]);
      if (!Number.isFinite(value)) throw new Error(`${row.season} ${row.team}: ${col} is missing`);
      return [key, value];
    }),
  );

const teams = parseCsv(readFileSync(teamsPath, "utf8")).filter((r) => r.lg === "NBA");
const opps = parseCsv(readFileSync(oppPath, "utf8")).filter((r) => r.lg === "NBA");
const totals = parseCsv(readFileSync(playersPath, "utf8")).filter((r) => r.lg === "NBA");

const latest = Math.max(...teams.map((r) => Number(r.season)));
const contexts = {};
const contextFor = (season, abbr) => {
  const key = `${season} ${abbr}`;
  if (contexts[key]) return key;
  const team = teams.find((r) => r.season === season && r.abbreviation === abbr);
  const opp = opps.find((r) => r.season === season && r.abbreviation === abbr);
  const league = teams.find((r) => r.season === season && r.team === "League Average");
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
  const rows = totals
    .filter((r) => r.player_id === id && !/^\dTM$|^TOT$/.test(r.team))
    .sort((a, b) => Number(a.season) - Number(b.season));
  if (rows.length === 0) throw new Error(`${id} is not in ${playersPath}`);
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
