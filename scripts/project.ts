// Finds comparables for Wembanyama and Horford after the last complete season and saves their projected
// futures to lib/model/projection.json, which the page reads. Rerun after rebuilding history.json.
//   node scripts/project.ts
import { readFileSync, writeFileSync } from "node:fs";
import { type History, type Params, buildIndex, project, seasonsFromHistory } from "../lib/model/winShares.ts";

const history: History = JSON.parse(readFileSync(new URL("../lib/model/history.json", import.meta.url), "utf8"));
const backtest = JSON.parse(readFileSync(new URL("../lib/model/backtest.json", import.meta.url), "utf8"));
const params: Params = backtest.params;
const lastComplete = history.latestSeasonPartial ? history.latestSeason - 1 : history.latestSeason;
const index = buildIndex(history, params);

const label = (endYear: number) => `${endYear - 1}-${String(endYear).slice(-2)}`;
const round = (v: number) => Math.round(v * 100) / 100;

const stored = (id: string) => {
  const player = history.players.find((p) => p.id === id);
  if (!player) throw new Error(`${id} is not in history.json`);
  const seasons = seasonsFromHistory(player, lastComplete);
  const checkpoint = Math.max(...seasons.map((s) => s.year));
  const proj = project(index, seasons, checkpoint, params, { exclude: id, pick: player.pick, height: player.ht });
  if (!proj) throw new Error(`No projection for ${id}`);
  const comps = proj.comps
    .map((c) => ({ name: c.name, season: label(c.year), age: c.age, weight: round(c.weight) }))
    .slice(0, 10);
  console.log(`${player.name} after ${label(checkpoint)}:`);
  console.log(`  next seasons ${proj.mean.slice(0, 8).map((v) => v.toFixed(1)).join(", ")}`);
  console.log(`  rest of career ${proj.mean.reduce((a, b) => a + b, 0).toFixed(1)}, next WS/48 ${proj.nextRate.toFixed(3)}`);
  console.log(`  comps ${comps.map((c) => `${c.name} ${c.season} (${(c.weight * 100).toFixed(0)}%)`).join("; ")}`);
  return {
    checkpoint,
    career: round(seasons.reduce((t, s) => t + s.winShares, 0)),
    mean: proj.mean.map(round),
    nextRate: Math.round(proj.nextRate * 1000) / 1000,
    paths: proj.paths.map((p) => p.map((v) => Math.round(v * 10) / 10)),
    weights: proj.weights.map((w) => Math.round(w * 10000) / 10000),
    comps,
  };
};

const wemby = stored("wembavi01");
const horford = stored("horfoal01");
writeFileSync(
  new URL("../lib/model/projection.json", import.meta.url),
  JSON.stringify({
    source: history.source,
    params: { noise: params.noise, inSeasonPriorMinutes: params.inSeasonPriorMinutes },
    wemby,
    horford,
  }),
);
