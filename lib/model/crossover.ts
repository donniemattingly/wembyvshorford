// Turns the stored comparable-player projections into this season's outlook and a crossover forecast.
// The heavy part (finding comparables in 60+ years of seasons) runs offline in scripts/project.ts and is
// saved in projection.json. This file only folds in the current season and runs the simulation, so it is
// cheap enough to run on every page load.
import type { Player } from "@/lib/stats.server";

export type StoredPlayer = {
  /** Season end year of the last complete season the projection starts from. */
  checkpoint: number;
  /** Career Win Shares through the checkpoint season. */
  career: number;
  /** Expected 82-game Win Shares for each season after the checkpoint. */
  mean: number[];
  /** Projected Win Shares per 48 minutes in the season after the checkpoint. */
  nextRate: number;
  paths: number[][];
  weights: number[];
  comps: { name: string; season: string; age?: number; weight: number }[];
};

export type StoredProjection = {
  params: { noise: number; inSeasonPriorMinutes: number };
  wemby: StoredPlayer;
  horford: StoredPlayer;
};

const GAMES = 82;
const SIMS = 4000;

// Regular-season start dates. Used to estimate how many team games are left.
const SEASON_DAYS = 174;
const seasonStart = (endYear: number) => Date.UTC(endYear - 1, 9, 21);

export const label = (endYear: number) => `${endYear - 1}–${String(endYear).slice(-2)}`;
const endYearOf = (season: string) => Number.parseInt(season.slice(0, 4), 10) + 1;

const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const gaussian = (random: () => number) =>
  Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) * Math.cos(2 * Math.PI * random());

const pick = (weights: number[], random: () => number) => {
  let r = random();
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
};

export const quantile = (sorted: number[], q: number) => {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

export type SeasonOutlook = {
  /** Win Shares so far this season. */
  soFar: number;
  /** Minutes played so far this season. */
  minutesSoFar: number;
  /** Preseason projected Win Shares per 48 minutes. */
  priorRate: number;
  /** Rate after blending in this season's play. */
  rate: number;
  /** Preseason projected full-season Win Shares and minutes. */
  priorTotal: number;
  priorMinutes: number;
  /** Share of the season still to play. */
  remaining: number;
  /** Expected Win Shares for the rest of this season. */
  rest: number;
  /** Talent multiplier from this season's play so far, relative to the preseason projection. */
  form: number;
  /** Projected full-season total. */
  total: number;
};

type Simulator = { outlook: SeasonOutlook; draw: (random: () => number) => number[]; careerNow: number };

export type Scenario = {
  /** Multiplier on every future season (1 = the model as built). */
  scale?: number;
  /** Season-to-season noise, as a log-normal sigma. Defaults to the tuned value. */
  noise?: number;
  /** Last season played (end year). Seasons after it count as zero. */
  retireAfter?: number | null;
};

/**
 * Sets up draws of a player's remaining seasons, starting with the current one.
 * `current` is the season in progress (end year), or the next season if none is under way.
 */
const simulator = (
  stored: StoredPlayer,
  player: Player,
  current: number,
  inProgress: boolean,
  teamGamesPlayed: number,
  params: StoredProjection["params"],
  scenario: Scenario = {},
): Simulator => {
  const scale = scenario.scale ?? 1;
  const sigma = scenario.noise ?? params.noise;
  const retireAfter = scenario.retireAfter ?? Infinity;
  const seasonRow = inProgress ? player.seasons.find((s) => endYearOf(s.season) === current) : undefined;
  const soFar = seasonRow?.winShares ?? 0;
  const minutesSoFar =
    seasonRow?.minutes ??
    (seasonRow?.winSharesPer48 ? (seasonRow.winShares * 48) / seasonRow.winSharesPer48 : 0);
  const careerNow = player.winShares;

  // Offset into the stored paths. If a season has finished since the projection was made, skip past it:
  // those seasons are now in the actual career total.
  const offset = Math.max(current - stored.checkpoint - 1, 0);
  // A player already playing this season is not retired, so only comparables who played that season count.
  const weights = stored.weights.map((wt, i) => (inProgress && !(stored.paths[i][offset] > 0) ? 0 : wt));
  const wSum = weights.reduce((a, b) => a + b, 0) || 1;
  const live = wSum > 0 && weights.some((x) => x > 0) ? weights.map((x) => x / wSum) : stored.weights;
  const meanAt = (h: number) => stored.paths.reduce((t, p, i) => t + live[i] * (p[h] ?? 0), 0);
  const priorTotal = meanAt(offset);
  const priorRate = stored.nextRate;
  const priorMinutes = priorRate > 0 ? (priorTotal * 48) / priorRate : 0;

  // This season's rate so far, weighed against the projected rate.
  const k = params.inSeasonPriorMinutes;
  const rate = priorRate > 0 ? (priorRate * k + soFar * 48) / (k + minutesSoFar) : 0;
  const form = priorRate > 0 ? Math.max(rate / priorRate, 0) : 1;
  const remaining = inProgress ? Math.max(GAMES - teamGamesPlayed, 0) / GAMES : 1;
  const rest = (rate * priorMinutes * remaining) / 48;

  const draw = (random: () => number) => {
    const path = stored.paths[pick(live, random)];
    const out: number[] = [];
    for (let h = offset; h < path.length; h++) {
      const noise = Math.exp(sigma * gaussian(random) - sigma ** 2 / 2);
      const year = stored.checkpoint + 1 + h;
      const value =
        h === offset ? Math.max(rest * (priorTotal > 0 ? path[h] / priorTotal : 0) * noise, 0) : path[h] * form * noise;
      out.push(year > retireAfter ? 0 : value * scale);
    }
    return out;
  };

  const restScaled = (stored.checkpoint + 1 + offset > retireAfter ? 0 : rest) * scale;
  return {
    outlook: {
      soFar,
      minutesSoFar,
      priorRate,
      rate,
      priorTotal,
      priorMinutes,
      remaining,
      rest: restScaled,
      form,
      total: soFar + restScaled,
    },
    draw,
    careerNow,
  };
};

export type Crossover = {
  wemby: SeasonOutlook & { low: number; high: number; careerMedian: number };
  horford: SeasonOutlook & { finalMedian: number };
  /** Share of simulations where Wembanyama passes Horford at some point. */
  chance: number;
  /** Among the simulations where he passes him: median crossover season, and the 10th and 90th percentiles. */
  median: string | null;
  low: string | null;
  high: string | null;
  /** Chance he has passed Horford by the end of each season. */
  byseason: { season: string; chance: number }[];
  comps: StoredPlayer["comps"];
  current: string;
};

/** One simulated pair of careers: cumulative Win Shares at the end of each season, and the crossing season. */
export type SimulatedCareer = { wemby: number[]; horford: number[]; crossed: number };

export type Simulation = {
  /** End year of the season in progress, or the next one to start. */
  current: number;
  inProgress: boolean;
  teamGames: number;
  /** Seasons simulated, starting with the current one. */
  horizon: number;
  wembyNow: number;
  horfordNow: number;
  wemby: SeasonOutlook;
  horford: SeasonOutlook;
  /** Runs the next `n` simulations. Results are deterministic for a given setup and call sequence. */
  run: (n: number) => SimulatedCareer[];
};

export const createSimulation = (
  stored: StoredProjection,
  wemby: Player,
  horford: Player,
  asOf: Date,
  scenario: { wemby?: Scenario; horford?: Scenario } = {},
): Simulation => {
  // The season in progress, or the next one to start.
  const month = asOf.getUTCMonth();
  const year = asOf.getUTCFullYear();
  const inProgress = month >= 9 || month <= 3;
  const current = month >= 9 ? year + 1 : month <= 3 ? year : year + 1;
  const elapsed = (asOf.getTime() - seasonStart(current)) / 86_400_000;
  const estimatedTeamGames = inProgress ? Math.min(Math.max(Math.round((elapsed / SEASON_DAYS) * GAMES), 0), GAMES) : 0;
  const gamesFor = (p: Player) => p.seasons.find((s) => endYearOf(s.season) === current)?.games ?? 0;
  const teamGames = Math.max(estimatedTeamGames, gamesFor(wemby), gamesFor(horford));

  const w = simulator(stored.wemby, wemby, current, inProgress, teamGames, stored.params, scenario.wemby);
  const h = simulator(stored.horford, horford, current, inProgress, teamGames, stored.params, scenario.horford);

  const random = rng(current * 7919 + Math.round(wemby.winShares * 10) + Math.round(horford.winShares * 10) * 31);
  const horizon = stored.wemby.paths[0].length - Math.max(current - stored.wemby.checkpoint - 1, 0);

  const run = (n: number) => {
    const out: SimulatedCareer[] = [];
    for (let i = 0; i < n; i++) {
      const wp = w.draw(random);
      const hp = h.draw(random);
      let wTotal = w.careerNow;
      let hTotal = h.careerNow;
      let crossed = wTotal >= hTotal ? current - 1 : Infinity;
      const wc: number[] = [];
      const hc: number[] = [];
      for (let s = 0; s < horizon; s++) {
        wTotal += wp[s] ?? 0;
        hTotal += hp[s] ?? 0;
        wc.push(wTotal);
        hc.push(hTotal);
        if (crossed === Infinity && wTotal >= hTotal) crossed = current + s;
      }
      out.push({ wemby: wc, horford: hc, crossed });
    }
    return out;
  };

  return {
    current,
    inProgress,
    teamGames,
    horizon,
    wembyNow: w.careerNow,
    horfordNow: h.careerNow,
    wemby: w.outlook,
    horford: h.outlook,
    run,
  };
};

export const projectCrossover = (stored: StoredProjection, wemby: Player, horford: Player, asOf: Date): Crossover => {
  const sim = createSimulation(stored, wemby, horford, asOf);
  const { current } = sim;
  const runs = sim.run(SIMS);
  const crossings = runs.map((r) => r.crossed);
  // This season's total is the first simulated season added to what he had before it.
  const wembyThisSeason = runs.map((r) => sim.wemby.soFar + (r.wemby[0] - sim.wembyNow));
  const wembyCareer = runs.map((r) => r.wemby.at(-1) ?? sim.wembyNow);
  const horfordFinal = runs.map((r) => r.horford.at(-1) ?? sim.horfordNow);
  const passed = crossings.filter((c) => Number.isFinite(c)).sort((a, b) => a - b);
  const sortedSeason = [...wembyThisSeason].sort((a, b) => a - b);
  // Crossing years are whole seasons, so take the season the quantile falls in rather than interpolating.
  const seasonLabel = (q: number) => (passed.length ? label(passed[Math.floor((passed.length - 1) * q)]) : null);
  const byseason = Array.from({ length: 16 }, (_, s) => {
    const y = current + s;
    return { season: label(y), chance: crossings.filter((c) => c <= y).length / SIMS };
  });

  return {
    wemby: {
      ...sim.wemby,
      low: quantile(sortedSeason, 0.1),
      high: quantile(sortedSeason, 0.9),
      careerMedian: quantile([...wembyCareer].sort((a, b) => a - b), 0.5),
    },
    horford: { ...sim.horford, finalMedian: quantile([...horfordFinal].sort((a, b) => a - b), 0.5) },
    chance: passed.length / SIMS,
    median: seasonLabel(0.5),
    low: seasonLabel(0.1),
    high: seasonLabel(0.9),
    byseason,
    comps: stored.wemby.comps,
    current: label(current),
  };
};
