// Builds lib/model/history.json from Basketball Reference season tables.
// Reads the advanced, team_summaries, draft_pick_history and player_career_info tables of the SQLite cache
// (scripts/lib/bbref-db.mjs), which loads them from https://github.com/sumitrodatta/bball-reference-datasets
// (scraped from Basketball Reference) the first time. Pass --refresh to download the latest CSVs first.
//   node scripts/build-history.mjs [--refresh]
import { writeFileSync } from "node:fs";
import { withDatasets } from "./lib/bbref-db.mjs";

const db = await withDatasets("advanced", "team_summaries", "draft_pick_history", "player_career_info");
const all = (sql, ...params) => db.prepare(sql).all(...params);

const FIRST_SEASON = 1960;

// Games on the schedule each season, from team records (wins + losses), using the most common value.
const teamGames = new Map();
for (const t of all("SELECT season, lg, team, w, l FROM team_summaries ORDER BY rowid")) {
  const season = t.season;
  if (t.w == null || t.l == null || t.team === "League Average") continue;
  const games = t.w + t.l;
  const key = `${t.lg}:${season}`;
  const counts = teamGames.get(key) ?? new Map();
  counts.set(games, (counts.get(games) ?? 0) + 1);
  teamGames.set(key, counts);
}
const scheduled = (lg, season) => {
  const counts = teamGames.get(`${lg}:${season}`);
  if (!counts) return 82;
  const games = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  // A season still being played shows only the games so far.
  return games < 40 ? 82 : games;
};

// One row per player-season. Traded players have a combined row (2TM, 3TM, TOT) plus one per team.
const bySeason = new Map();
const advanced = all(
  `SELECT season, lg, player, player_id, age, team, g, mp, ws, bpm FROM advanced
   WHERE season >= ? AND player_id IS NOT NULL ORDER BY rowid`,
  FIRST_SEASON,
);
for (const r of advanced) {
  const season = r.season;
  const key = `${r.player_id}:${season}:${r.lg}`;
  const combined = /^(\dTM|TOT)$/.test(r.team);
  const existing = bySeason.get(key);
  if (existing && !combined) continue;
  bySeason.set(key, { ...r, season, combined });
}

const players = new Map();
for (const r of bySeason.values()) {
  const p = players.get(r.player_id) ?? { id: r.player_id, name: r.player, rows: new Map() };
  const g = Number(r.g) || 0;
  const mp = Number(r.mp) || 0;
  const ws = Number(r.ws) || 0;
  const len = scheduled(r.lg, r.season);
  const bpm = r.bpm == null ? null : Number(r.bpm);
  // Rare seasons split across NBA and ABA are summed.
  const prev = p.rows.get(r.season);
  if (prev) {
    prev[2] += g;
    prev[3] += mp;
    prev[4] = Math.round((prev[4] + ws) * 10) / 10;
  } else {
    p.rows.set(r.season, [r.season, Number(r.age) || 0, g, mp, ws, len, Number.isFinite(bpm) ? bpm : null]);
  }
  players.set(r.player_id, p);
}

// NBA draft slot (first time drafted into the NBA) and height in inches.
const picks = new Map();
for (const d of all("SELECT player_id, overall_pick FROM draft_pick_history WHERE lg = 'NBA' AND player_id IS NOT NULL ORDER BY rowid")) {
  if (picks.has(d.player_id)) continue;
  const pick = Number(d.overall_pick);
  if (Number.isFinite(pick) && pick > 0) picks.set(d.player_id, pick);
}
const heights = new Map();
for (const i of all("SELECT player_id, ht_in_in FROM player_career_info ORDER BY rowid")) {
  const ht = Number(i.ht_in_in);
  if (Number.isFinite(ht) && ht > 0) heights.set(i.player_id, ht);
}

const out = [...players.values()]
  .map((p) => ({
    id: p.id,
    name: p.name,
    pick: picks.get(p.id) ?? null,
    ht: heights.get(p.id) ?? null,
    s: [...p.rows.values()].sort((a, b) => a[0] - b[0]),
  }))
  .sort((a, b) => a.id.localeCompare(b.id));

const latest = Math.max(...out.flatMap((p) => p.s.map((s) => s[0])));
const latestGames = [...(teamGames.get(`NBA:${latest}`) ?? new Map()).keys()];
const partial = Math.max(...latestGames) < 60;
writeFileSync(
  new URL("../lib/model/history.json", import.meta.url),
  JSON.stringify({
    source: "Basketball Reference, via github.com/sumitrodatta/bball-reference-datasets",
    // Season columns: [season end year, age, games, minutes, win shares, games on the schedule, box plus/minus]
    latestSeason: latest,
    // True while the latest season is still being played. Those rows are partial totals.
    latestSeasonPartial: partial,
    players: out,
  }),
);
console.log(`${out.length} players, latest season ${latest}`);
