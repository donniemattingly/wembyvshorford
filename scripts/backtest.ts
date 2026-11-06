// Backtests the Win Shares model on players whose futures we already know.
//   node scripts/backtest.ts            prints the report and writes lib/model/backtest.json
//   node scripts/backtest.ts --tune     also searches the parameter grid on non-great players first
import { readFileSync, writeFileSync } from "node:fs";
import {
  DEFAULT_PARAMS,
  type History,
  type HistoryPlayer,
  type Index,
  type Params,
  buildIndex,
  project,
  quantile,
  rng,
  samplePath,
  seasonsFromHistory,
} from "../lib/model/winShares.ts";

const history: History = JSON.parse(readFileSync(new URL("../lib/model/history.json", import.meta.url), "utf8"));
const lastComplete = history.latestSeasonPartial ? history.latestSeason - 1 : history.latestSeason;
const per82 = (ws: number, len: number) => (ws * 82) / (len || 82);

type Case = { player: HistoryPlayer; year: number; age: number; careerSeason: number };
type Outcome = { next1: number | null; next5: number | null; rest: number | null };

const debutOf = (p: HistoryPlayer) => p.s[0][0];
const careerWs = (p: HistoryPlayer) => p.s.reduce((t, r) => t + r[4], 0);
const lastYearOf = (p: HistoryPlayer) => p.s[p.s.length - 1][0];
const retired = (p: HistoryPlayer) => lastYearOf(p) < lastComplete;

const outcome = (p: HistoryPlayer, year: number): Outcome => {
  const byYear = new Map(p.s.map((r) => [r[0], r]));
  const at = (y: number) => {
    const r = byYear.get(y);
    return r ? per82(r[4], r[5]) : 0;
  };
  const sum = (n: number) => Array.from({ length: n }, (_, i) => at(year + i + 1)).reduce((a, b) => a + b, 0);
  const restYears = lastYearOf(p) - year;
  return {
    next1: year + 1 <= lastComplete ? at(year + 1) : null,
    next5: year + 5 <= lastComplete ? sum(5) : null,
    // Rest of career only for checkpoints at least 20 seasons back. Using only retired players instead would
    // keep recent flameouts and drop recent stars who are still playing.
    rest: year <= lastComplete - 20 ? sum(Math.max(restYears, 0)) : null,
  };
};

// Checkpoint after the player's nth season in the league.
const checkpoint = (p: HistoryPlayer, n: number): Case | null => {
  const row = p.s[n - 1];
  if (!row || row[0] > lastComplete) return null;
  return { player: p, year: row[0], age: row[1], careerSeason: n };
};

// A plain aging curve: the target's level times what the average player at his age and level band did next.
const agingCurve = (index: Index) => {
  const cache = new Map<string, number[]>();
  return (age: number, level: number, exclude: string) => {
    const band = level >= 8 ? 2 : level >= 4 ? 1 : 0;
    const key = `${age}:${band}`;
    if (!cache.has(key)) {
      const list = (index.byAge.get(age)?.entries ?? []).filter((c) => {
        const l = c.state.level;
        return (band === 2 ? l >= 8 : band === 1 ? l >= 4 && l < 8 : l >= 1 && l < 4) && c.state.id !== exclude;
      });
      const curve = Array.from({ length: 25 }, (_, h) => {
        let t = 0;
        let n = 0;
        for (const c of list) {
          const v = c.future[h] ?? null;
          if (v == null || c.state.year + h + 1 > lastComplete) continue;
          t += v / Math.max(c.state.level, 0.5);
          n++;
        }
        return n ? t / n : 0;
      });
      cache.set(key, curve);
    }
    return (cache.get(key) as number[]).map((r) => r * level);
  };
};

type Row = {
  name: string;
  id: string;
  year: number;
  age: number;
  careerSeason: number;
  actual: Outcome;
  model: { next1: number; next5: number; rest: number; restLo: number; restHi: number; next5Lo: number; next5Hi: number; over: number[] };
  repeat: { next1: number; next5: number };
  curve: { next1: number; next5: number; rest: number };
};

const evaluate = (cases: Case[], params: Params, index: Index, sims = 1000, strict = false): Row[] => {
  const curveFor = agingCurve(index);
  const rows: Row[] = [];
  for (const c of cases) {
    const seasons = seasonsFromHistory(c.player, c.year);
    const proj = project(index, seasons, c.year, params, {
      exclude: c.player.id,
      maxYear: strict ? c.year : undefined,
      pick: c.player.pick,
      height: c.player.ht,
    });
    if (!proj) continue;
    const random = rng(c.year * 1000 + c.careerSeason);
    const restSims: number[] = [];
    const next5Sims: number[] = [];
    for (let i = 0; i < sims; i++) {
      const path = samplePath(proj, params, random);
      restSims.push(path.reduce((a, b) => a + b, 0));
      next5Sims.push(path.slice(0, 5).reduce((a, b) => a + b, 0));
    }
    restSims.sort((a, b) => a - b);
    next5Sims.sort((a, b) => a - b);
    const last = proj.state.last;
    const curve = curveFor(c.age, proj.state.level, c.player.id);
    rows.push({
      name: c.player.name,
      id: c.player.id,
      year: c.year,
      age: c.age,
      careerSeason: c.careerSeason,
      actual: outcome(c.player, c.year),
      model: {
        next1: proj.mean[0],
        next5: proj.mean.slice(0, 5).reduce((a, b) => a + b, 0),
        rest: proj.mean.reduce((a, b) => a + b, 0),
        restLo: quantile(restSims, 0.1),
        restHi: quantile(restSims, 0.9),
        next5Lo: quantile(next5Sims, 0.1),
        next5Hi: quantile(next5Sims, 0.9),
        over: [40, 70, 100].map((t) => restSims.filter((v) => v >= t).length / Math.max(restSims.length, 1)),
      },
      repeat: { next1: last, next5: last * 5 },
      curve: { next1: curve[0], next5: curve.slice(0, 5).reduce((a, b) => a + b, 0), rest: curve.reduce((a, b) => a + b, 0) },
    });
  }
  return rows;
};

type Metric = { n: number; mae: number; bias: number; coverage?: number };
const metric = (rows: Row[], pick: (r: Row) => [number | null, number | null], cover?: (r: Row) => [number, number]): Metric => {
  const ok = rows.filter((r) => pick(r)[0] != null && pick(r)[1] != null);
  const errs = ok.map((r) => (pick(r)[0] as number) - (pick(r)[1] as number));
  const result: Metric = {
    n: ok.length,
    mae: errs.reduce((t, e) => t + Math.abs(e), 0) / (ok.length || 1),
    bias: errs.reduce((t, e) => t + e, 0) / (ok.length || 1),
  };
  if (cover) {
    const inside = ok.filter((r) => {
      const [lo, hi] = cover(r);
      const actual = pick(r)[1] as number;
      return actual >= lo && actual <= hi;
    }).length;
    result.coverage = inside / (ok.length || 1);
  }
  return result;
};

const summarize = (rows: Row[]) => ({
  cases: rows.length,
  next1: {
    model: metric(rows, (r) => [r.model.next1, r.actual.next1]),
    repeat: metric(rows, (r) => [r.repeat.next1, r.actual.next1]),
    curve: metric(rows, (r) => [r.curve.next1, r.actual.next1]),
  },
  next5: {
    model: metric(rows, (r) => [r.model.next5, r.actual.next5], (r) => [r.model.next5Lo, r.model.next5Hi]),
    repeat: metric(rows, (r) => [r.repeat.next5, r.actual.next5]),
    curve: metric(rows, (r) => [r.curve.next5, r.actual.next5]),
  },
  rest: {
    model: metric(rows, (r) => [r.model.rest, r.actual.rest], (r) => [r.model.restLo, r.model.restHi]),
    curve: metric(rows, (r) => [r.curve.rest, r.actual.rest]),
  },
});

// --- Who gets tested -------------------------------------------------------------------------------------------

const modern = history.players.filter((p) => debutOf(p) >= 1965 && p.s[0][1] <= 24);

// The all-time greats: the 60 highest career Win Shares totals among players who debuted from 1965 on.
const greats = [...modern].sort((a, b) => careerWs(b) - careerWs(a)).slice(0, 60);
const greatIds = new Set(greats.map((p) => p.id));

const casesFor = (players: HistoryPlayer[], seasons: number[]) =>
  players.flatMap((p) => seasons.map((n) => checkpoint(p, n)).filter((c): c is Case => c != null));

const greatCases = casesFor(greats, [2, 3, 4]);

// Every early-career star, picked only by what was known at the time: after his third season, at age 24 or
// younger, at least .150 WS/48 over 1,500+ minutes. This set is free of hindsight about who became great.
const starCases = (index: Index) =>
  casesFor(modern, [3]).filter((c) => {
    const row = c.player.s[2];
    return c.age <= 24 && row[3] >= 1500 && (row[4] * 48) / row[3] >= 0.15;
  });

// Tuning uses good young players, picked only by what was known at the time: after seasons 2-4, age 24 or under, 1,200+
// minutes at .100 WS/48 or better. Half of them (split by player) tune the model; the other half check it.
const half = (p: HistoryPlayer) => [...p.id].reduce((t, ch) => t + ch.charCodeAt(0), 0) % 2;
const youngGood = casesFor(
  modern.filter((p) => debutOf(p) <= 2012),
  [2, 3, 4],
).filter((c) => {
  const row = c.player.s[c.careerSeason - 1];
  return row != null && c.age <= 24 && row[3] >= 1200 && (row[4] * 48) / row[3] >= 0.1;
});
const tuneCases = youngGood.filter((c) => half(c.player) === 0);
const checkCases = youngGood.filter((c) => half(c.player) === 1);

const score = (rows: Row[]) => {
  const s = summarize(rows);
  // Accuracy first, with a penalty for leaning high or low.
  return s.rest.model.mae + s.next5.model.mae + 0.5 * (Math.abs(s.rest.model.bias) + Math.abs(s.next5.model.bias));
};

let params = { ...DEFAULT_PARAMS };
if (process.argv.includes("--tune")) {
  // Coordinate search: try each setting of one parameter with the others held, keep the best, repeat.
  const options: { [K in keyof Params]?: Params[K][] } = {
    recency: [
      [5, 4, 3],
      [6, 3, 1],
      [8, 3, 1],
      [10, 3, 0],
      [1, 0, 0],
    ],
    comps: [15, 25, 40, 60, 100],
    bandwidth: [0.5, 1, 2, 4, 8],
    minEffective: [1, 8, 15, 25],
    blendNear: [0, 0.25, 0.5, 0.75, 1],
    blendFar: [0.25, 0.5, 0.75, 1],
    scaling: [0, 0.25, 0.5, 0.75, 1, 1.25],
    scaleOnRate: [0, 0.5, 1],
    rateScale: [0.012, 0.018, 0.025, 0.035, 0.05],
    bpmScale: [1.5, 2.5, 4, 1000],
    minutesScale: [250, 450, 700, 1200],
    lastScale: [1.5, 2.5, 4, 1000],
    careerScale: [5, 10, 20, 1000],
    agePenalty: [0.25, 1, 3, 1000],
    missingPenalty: [0, 1, 2, 4, 8],
    rateShrinkMinutes: [100, 300, 800],
    pickEffect: [0, 0.03, 0.06, 0.1],
    heightEffect: [0, 0.01, 0.02, 0.04],
  };
  const sample = tuneCases;
  const memo = new Map<string, number>();
  const scoreOf = (p: Params) => {
    const key = JSON.stringify(p);
    if (!memo.has(key)) memo.set(key, score(evaluate(sample, p, buildIndex(history, p), 0)));
    return memo.get(key) as number;
  };
  let best = scoreOf(params);
  for (let pass = 0; pass < 2; pass++) {
    for (const [name, values] of Object.entries(options) as [keyof Params, Params[keyof Params][]][]) {
      for (const v of values) {
        const p = { ...params, [name]: v } as Params;
        const s = scoreOf(p);
        if (s < best - 1e-9) {
          best = s;
          params = p;
        }
      }
      console.log(`pass ${pass + 1} ${name}: ${JSON.stringify(params[name])}  score ${best.toFixed(2)}`);
    }
  }
  // Noise is set so the 80% range holds about 80% of outcomes on the tuning set.
  const index = buildIndex(history, params);
  let bestNoise = { gap: Infinity, noise: params.noise };
  for (const noise of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6]) {
    const s = summarize(evaluate(sample, { ...params, noise }, index, 400));
    const gap = Math.abs((s.rest.model.coverage ?? 0) - 0.8) + Math.abs((s.next5.model.coverage ?? 0) - 0.8);
    if (gap < bestNoise.gap) bestNoise = { gap, noise };
  }
  params = { ...params, noise: bestNoise.noise };
  console.log("tuned", JSON.stringify(params));
}

const index = buildIndex(history, params);
const fmt = (m: Metric) =>
  `n=${String(m.n).padStart(3)}  MAE ${m.mae.toFixed(1).padStart(5)}  bias ${(m.bias >= 0 ? "+" : "") + m.bias.toFixed(1)}` +
  (m.coverage != null ? `  80% range hit ${(m.coverage * 100).toFixed(0)}%` : "");
const report = (label: string, rows: Row[]) => {
  const s = summarize(rows);
  console.log(`\n${label} (${s.cases} checkpoints)`);
  console.log(`  next season   model  ${fmt(s.next1.model)}`);
  console.log(`                repeat ${fmt(s.next1.repeat)}`);
  console.log(`                curve  ${fmt(s.next1.curve)}`);
  console.log(`  next 5        model  ${fmt(s.next5.model)}`);
  console.log(`                repeat ${fmt(s.next5.repeat)}`);
  console.log(`                curve  ${fmt(s.next5.curve)}`);
  console.log(`  rest of car.  model  ${fmt(s.rest.model)}`);
  console.log(`                curve  ${fmt(s.rest.curve)}`);
  return s;
};

const greatRows = evaluate(greatCases, params, index);
const starRows = evaluate(starCases(index), params, index);
const tuneRows = evaluate(tuneCases, params, index, 300);
const checkRows = evaluate(checkCases, params, index, 300);
const greatsSummary = report("All-time greats, after seasons 2-4", greatRows);
const starsSummary = report("Every early star (no hindsight), after season 3", starRows);
const eliteCases = casesFor(modern, [2, 3, 4]).filter((c) => {
  const row = c.player.s[c.careerSeason - 1];
  return c.age <= 23 && row[3] >= 1500 && ((row[4] * 48) / row[3] >= 0.19 || (row[6] ?? -9) >= 6);
});
const eliteRows = evaluate(eliteCases, params, index);
const eliteSummary = report("Elite young players (no hindsight): age 23 or under, .190 WS/48 or +6 BPM", eliteRows);
if (process.argv.includes("--elite"))
  for (const r of eliteRows.filter((r) => r.careerSeason === 3))
    console.log(`  ${r.name.padEnd(24)} ${r.year} ${r.model.rest.toFixed(0).padStart(4)} [${r.model.restLo.toFixed(0)}-${r.model.restHi.toFixed(0)}] ${r.actual.rest?.toFixed(0) ?? "active"}`);
report("Good young players, tuning half", tuneRows);
const checkSummary = report("Good young players, held-out half", checkRows);

const strictRows = evaluate(
  greatCases.filter((c) => c.year >= 1995),
  params,
  index,
  1000,
  true,
);
const strictSummary = report("Greats since 1995, using only data available at the time", strictRows);

const third = greatRows.filter((r) => r.careerSeason === 3);
console.log("\nAfter season 3, rest of career (82-game WS): player, projected [80% range], actual");
for (const r of third)
  console.log(
    `  ${r.name.padEnd(24)} ${r.year}  ${r.model.rest.toFixed(0).padStart(4)} [${r.model.restLo.toFixed(0)}-${r.model.restHi.toFixed(0)}]  ${
      r.actual.rest == null ? "active" : r.actual.rest.toFixed(0)
    }`,
  );

writeFileSync(
  new URL("../lib/model/backtest.json", import.meta.url),
  JSON.stringify(
    {
      params,
      greats: greatsSummary,
      stars: starsSummary,
      elite: eliteSummary,
      heldOut: checkSummary,
      strict: strictSummary,
      // Average predicted chance of 40, 70 and 100+ more Win Shares, and the share who got there.
      tails: Object.fromEntries(
        (
          [
            ["stars", starRows],
            ["elite", eliteRows],
          ] as const
        ).map(([name, rows]) => {
          const ok = rows.filter((r) => r.actual.rest != null);
          return [
            name,
            [40, 70, 100].map((t, i) => ({
              threshold: t,
              predicted: ok.reduce((a, r) => a + r.model.over[i], 0) / ok.length,
              actual: ok.filter((r) => (r.actual.rest as number) >= t).length / ok.length,
            })),
          ];
        }),
      ),
      examples: third.map((r) => ({
        name: r.name,
        year: r.year,
        projected: Math.round(r.model.rest),
        low: Math.round(r.model.restLo),
        high: Math.round(r.model.restHi),
        actual: r.actual.rest == null ? null : Math.round(r.actual.rest),
      })),
    },
    null,
    1,
  ),
);

if (process.argv.includes("--blend")) {
  for (const [name, rows] of [["held-out", checkRows], ["elite", eliteRows], ["greats", greatRows], ["stars", starRows]] as const) {
    const out: string[] = [];
    for (const a of [0, 0.25, 0.5, 0.75, 1]) {
      const m = (pick: (r: Row) => [number, number | null]) => {
        const ok = rows.filter((r) => pick(r)[1] != null);
        return (ok.reduce((t, r) => t + Math.abs(pick(r)[0] - (pick(r)[1] as number)), 0) / ok.length).toFixed(2);
      };
      out.push(
        `a=${a}: n1 ${m((r) => [a * r.model.next1 + (1 - a) * r.curve.next1, r.actual.next1])} n5 ${m((r) => [a * r.model.next5 + (1 - a) * r.curve.next5, r.actual.next5])} rest ${m((r) => [a * r.model.rest + (1 - a) * r.curve.rest, r.actual.rest])}`,
      );
    }
    console.log(name, "\n  " + out.join("\n  "));
  }
}

if (process.argv.includes("--tails")) {
  for (const [name, rows] of [["elite", eliteRows], ["stars", starRows], ["held-out", checkRows], ["greats", greatRows]] as const) {
    const ok = rows.filter((r) => r.actual.rest != null);
    const line = [40, 70, 100].map((t, i) => {
      const predicted = ok.reduce((a, r) => a + r.model.over[i], 0) / ok.length;
      const actual = ok.filter((r) => (r.actual.rest as number) >= t).length / ok.length;
      return `>=${t}: predicted ${(predicted * 100).toFixed(0)}% actual ${(actual * 100).toFixed(0)}%`;
    });
    console.log(name, ok.length, line.join(" | "));
  }
}
