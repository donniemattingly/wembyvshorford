// Comparable-player projection of future Win Shares.
//
// For a player at a given point in his career, find the players who looked most like him at the same age
// (Win Shares per 48 minutes, minutes played, last season's Win Shares, career total), then follow what those
// players did next. Each comparable's future is scaled by how much better or worse the target is than that
// comparable, so an outlier is compared with the best players at his age and is not pulled back to average.
// Seasons are scaled to 82 games so lockout years count the same as full ones.

/** [season end year, age, games, minutes, win shares, games on the schedule, box plus/minus or null] */
export type SeasonRow = [number, number, number, number, number, number, (number | null)?];
export type HistoryPlayer = { id: string; name: string; pick?: number | null; ht?: number | null; s: SeasonRow[] };
export type History = { source?: string; latestSeason: number; latestSeasonPartial: boolean; players: HistoryPlayer[] };

export type Params = {
  /** Weights on the last three seasons, most recent first. */
  recency: [number, number, number];
  /** Similarity scales: a difference of one scale unit costs one point of distance. */
  rateScale: number;
  bpmScale: number;
  minutesScale: number;
  lastScale: number;
  careerScale: number;
  /** Scale on the log of draft slot (undrafted counts as pick 70). */
  pickScale: number;
  /** Scale on height in inches. */
  heightScale: number;
  /** Adjustment to a comparable's future per unit of log draft slot between him and the target. */
  pickEffect: number;
  /** Adjustment per inch of height between comparable and target (capped at 4 inches). */
  heightEffect: number;
  /** Distance charged when a comparable has no box plus/minus. */
  missingPenalty: number;
  /** Extra distance for a comparable one year older or younger. */
  agePenalty: number;
  /** How many comparables to keep. */
  comps: number;
  /** Weight on comparables versus the plain aging curve, next season and four or more seasons out. */
  blendNear: number;
  blendFar: number;
  /** Larger values weight the comparables more evenly. */
  /** Least number of comparables, in effect, that carry the weight. */
  minEffective: number;
  bandwidth: number;
  /** 0 uses comparables' raw futures, 1 scales them fully by the target's level relative to theirs. */
  scaling: number;
  /** 0 measures the gap between target and comparable by Win Shares per season, 1 by Win Shares per 48. */
  scaleOnRate: number;
  /** Minutes of league-average play mixed into a player's rate, to steady small samples. */
  rateShrinkMinutes: number;
  /** Minutes of the projected rate the in-season rate is weighed against. */
  inSeasonPriorMinutes: number;
  /** Spread of season-to-season noise added in simulations (log scale). */
  noise: number;
};

export const DEFAULT_PARAMS: Params = {
  recency: [8, 3, 1],
  rateScale: 0.025,
  bpmScale: 1.5,
  minutesScale: 700,
  lastScale: 4,
  careerScale: 1000,
  pickScale: 1000,
  heightScale: 1000,
  pickEffect: 0.06,
  heightEffect: 0.04,
  agePenalty: 1000,
  missingPenalty: 8,
  comps: 60,
  bandwidth: 0.5,
  minEffective: 15,
  blendNear: 0,
  blendFar: 1,
  scaling: 1,
  scaleOnRate: 0,
  rateShrinkMinutes: 800,
  inSeasonPriorMinutes: 1200,
  noise: 0.4,
};

const LEAGUE_RATE = 0.09;
// Box plus/minus of a below-average rotation player, where small samples are pulled toward.
const LEAGUE_BPM = -2;
const MAX_AGE = 44;

export type TargetSeason = {
  year: number;
  age: number;
  games: number;
  minutes: number;
  winShares: number;
  scheduled: number;
  bpm?: number | null;
};

type State = {
  id: string;
  name: string;
  year: number;
  age: number;
  rate: number;
  bpm: number | null;
  minutes: number;
  last: number;
  level: number;
  career: number;
  pick: number;
  height: number | null;
};

/** Win Shares per 82 games in each later season (index 0 is the next one); null where not yet known. */
type Future = (number | null)[];

export type Comparable = { id: string; name: string; year: number; age: number; weight: number; scale: number; path: number[] };

export type Projection = {
  /** Expected 82-game Win Shares for each future season, starting with the season after `year`. */
  mean: number[];
  /** Projected Win Shares per 48 minutes for the next season. */
  nextRate: number;
  comps: Comparable[];
  /** Season-by-season paths, one per comparable, scaled to the target. Censored seasons are filled in. */
  paths: number[][];
  weights: number[];
  state: State;
};

const per82 = (value: number, scheduled: number) => (value * 82) / (scheduled || 82);

const toTarget = (row: SeasonRow): TargetSeason => ({
  year: row[0],
  age: row[1],
  games: row[2],
  minutes: row[3],
  winShares: row[4],
  scheduled: row[5],
  bpm: row[6] ?? null,
});

/** The player's profile after the season ending in `year`. Seasons missed after his debut count as zeros. */
export const stateAt = (
  seasons: TargetSeason[],
  year: number,
  params: Params,
  id = "",
  name = "",
  profile: { pick?: number | null; height?: number | null } = {},
): State | null => {
  const byYear = new Map(seasons.map((s) => [s.year, s]));
  const current = byYear.get(year);
  if (!current) return null;
  const debut = Math.min(...seasons.map((s) => s.year));
  let wSum = 0;
  let wsW = 0;
  let minW = 0;
  let rateNum = 0;
  let rateDen = 0;
  let bpmNum = 0;
  let bpmDen = 0;
  params.recency.forEach((w, i) => {
    const y = year - i;
    if (y < debut) return;
    const s = byYear.get(y);
    const ws = s ? per82(s.winShares, s.scheduled) : 0;
    const min = s ? per82(s.minutes, s.scheduled) : 0;
    wSum += w;
    wsW += w * ws;
    minW += w * min;
    rateNum += w * (s ? s.winShares * 48 : 0);
    rateDen += w * (s ? s.minutes : 0);
    if (s && s.bpm != null) {
      bpmNum += w * s.minutes * s.bpm;
      bpmDen += w * s.minutes;
    }
  });
  const k = params.rateShrinkMinutes * (wSum / params.recency[0]);
  const career = seasons.filter((s) => s.year <= year).reduce((t, s) => t + s.winShares, 0);
  return {
    id,
    name,
    year,
    age: current.age,
    rate: (rateNum + k * LEAGUE_RATE) / (rateDen + k),
    bpm: bpmDen > 0 ? (bpmNum + k * LEAGUE_BPM) / (bpmDen + k) : null,
    minutes: minW / wSum,
    level: wsW / wSum,
    last: per82(current.winShares, current.scheduled),
    career,
    pick: Math.log(profile.pick ?? 70),
    height: profile.height ?? null,
  };
};

type Entry = { state: State; future: Future; rateNext: number | null };
type Bucket = {
  entries: Entry[];
  rate: Float64Array;
  bpm: Float64Array;
  minutes: Float64Array;
  last: Float64Array;
  career: Float64Array;
  pick: Float64Array;
  height: Float64Array;
};

/** Plain aging curve: for each age and level band, the summed ratio of later seasons to current level. */
type Curve = { sum: Float64Array; n: Float64Array };
export type Index = { byAge: Map<number, Bucket>; curves: Map<string, Curve>; lastComplete: number };

const band = (level: number) => (level >= 8 ? 3 : level >= 4 ? 2 : level >= 1 ? 1 : 0);
// Typical level inside each band, for interpolating between them.
const BAND_CENTERS = [0.5, 2.5, 6, 10];
const curveContribution = (e: Entry, lastComplete: number, h: number) => {
  const v = e.future[h];
  if (v == null || e.state.year + h + 1 > lastComplete) return null;
  return v / Math.max(e.state.level, 0.5);
};

/** Precomputes every player's profile after every season, with what he did afterwards. */
export const buildIndex = (history: History, params: Params, ages?: number[]): Index => {
  const lastComplete = history.latestSeasonPartial ? history.latestSeason - 1 : history.latestSeason;
  const wanted = ages ? new Set(ages.flatMap((a) => [a - 1, a, a + 1])) : null;
  const lists = new Map<number, Entry[]>();
  for (const p of history.players) {
    const seasons = p.s.filter((r) => r[0] <= lastComplete).map(toTarget);
    if (seasons.length === 0) continue;
    const lastYear = Math.max(...p.s.map((r) => r[0]));
    // A player who appeared in the last full season or the current one is still active, so his later seasons
    // are unknown. Everyone else is treated as retired.
    const active = lastYear >= lastComplete;
    const byYear = new Map(seasons.map((s) => [s.year, s]));
    for (const s of seasons) {
      if (wanted && !wanted.has(s.age)) continue;
      const state = stateAt(seasons, s.year, params, p.id, p.name, { pick: p.pick, height: p.ht });
      if (!state) continue;
      const future: Future = Array.from({ length: Math.max(MAX_AGE - s.age, 1) }, (_, i) => {
        const y = s.year + i + 1;
        if (y > lastComplete) return active ? null : 0;
        const row = byYear.get(y);
        return row ? per82(row.winShares, row.scheduled) : 0;
      });
      const next = byYear.get(s.year + 1);
      const rateNext = next && next.minutes >= 500 ? (next.winShares * 48) / next.minutes : null;
      const list = lists.get(state.age) ?? [];
      list.push({ state, future, rateNext });
      lists.set(state.age, list);
    }
  }
  const byAge = new Map<number, Bucket>();
  const curves = new Map<string, Curve>();
  for (const [age, entries] of lists) {
    for (const e of entries) {
      const key = `${age}:${band(e.state.level)}`;
      const curve = curves.get(key) ?? { sum: new Float64Array(MAX_AGE), n: new Float64Array(MAX_AGE) };
      for (let h = 0; h < MAX_AGE; h++) {
        const r = curveContribution(e, lastComplete, h);
        if (r == null) continue;
        curve.sum[h] += r;
        curve.n[h]++;
      }
      curves.set(key, curve);
    }
    const col = (f: (s: State) => number) => Float64Array.from(entries, (e) => f(e.state));
    byAge.set(age, {
      entries,
      rate: col((s) => s.rate),
      bpm: col((s) => s.bpm ?? NaN),
      minutes: col((s) => s.minutes),
      last: col((s) => s.last),
      career: col((s) => s.career),
      pick: col((s) => s.pick),
      height: col((s) => s.height ?? NaN),
    });
  }
  return { byAge, curves, lastComplete };
};

/** The k-th smallest value (0-based). Reorders `a`. */
const kth = (a: Float64Array, k: number) => {
  let lo = 0;
  let hi = a.length - 1;
  while (lo < hi) {
    const pivot = a[(lo + hi) >> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (a[i] < pivot) i++;
      while (a[j] > pivot) j--;
      if (i <= j) {
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else return a[k];
  }
  return a[k];
};

/**
 * Projects the seasons after `year` for a player with the given season history.
 * `exclude` drops a player from the comparables (used when backtesting him).
 */
export const project = (
  index: Index,
  seasons: TargetSeason[],
  year: number,
  params: Params,
  {
    exclude,
    maxYear,
    pick,
    height,
  }: { exclude?: string; maxYear?: number; pick?: number | null; height?: number | null } = {},
): Projection | null => {
  const state = stateAt(seasons, year, params, "", "", { pick, height });
  if (!state) return null;
  const horizon = Math.max(1, MAX_AGE - state.age);

  const candidates: { c: Entry; d: number }[] = [];
  const rs = 1 / params.rateScale ** 2;
  const bs = 1 / params.bpmScale ** 2;
  const ms = 1 / params.minutesScale ** 2;
  const ls = 1 / params.lastScale ** 2;
  const cs = 1 / params.careerScale ** 2;
  const ps = 1 / params.pickScale ** 2;
  const hs = 1 / params.heightScale ** 2;
  const tHt = state.height;
  const tBpm = state.bpm;
  for (const ageOffset of [-1, 0, 1]) {
    const b = index.byAge.get(state.age + ageOffset);
    if (!b) continue;
    const base = ageOffset === 0 ? 0 : params.agePenalty;
    // Only distances under the current cutoff are kept, which keeps the candidate list short.
    for (let i = 0; i < b.entries.length; i++) {
      const bpm = b.bpm[i];
      const d =
        base +
        (state.rate - b.rate[i]) ** 2 * rs +
        // A comparable without box plus/minus (before 1974) pays a flat penalty instead of matching for free.
        (tBpm != null ? (bpm === bpm ? (tBpm - bpm) ** 2 * bs : params.missingPenalty) : 0) +
        (state.minutes - b.minutes[i]) ** 2 * ms +
        (state.last - b.last[i]) ** 2 * ls +
        (state.career - b.career[i]) ** 2 * cs +
        (state.pick - b.pick[i]) ** 2 * ps +
        (tHt != null && b.height[i] === b.height[i] ? (tHt - b.height[i]) ** 2 * hs : 0);
      if (d > 60) continue;
      const c = b.entries[i];
      if (c.state.id === exclude) continue;
      // In a strict backtest, only use comparables whose own season came before the target's.
      if (maxYear != null && c.state.year > maxYear) continue;
      candidates.push({ c, d });
    }
  }
  if (candidates.length < params.comps) {
    // Nobody close: fall back to the nearest players at this age regardless of distance.
    const b = index.byAge.get(state.age);
    for (const c of b?.entries ?? []) {
      if (c.state.id === exclude || candidates.some((x) => x.c === c)) continue;
      if (maxYear != null && c.state.year > maxYear) continue;
      const d = ((state.rate - c.state.rate) / params.rateScale) ** 2 + ((state.minutes - c.state.minutes) / params.minutesScale) ** 2;
      candidates.push({ c, d });
    }
  }
  // Keep the nearest few, one season per comparable player. Finding a cutoff on a typed array first is much
  // faster than sorting every candidate. A player can appear up to three times (three ages), hence 3x.
  let pool = candidates;
  const room = params.comps * 3;
  if (candidates.length > room) {
    const ds = new Float64Array(candidates.length);
    for (let i = 0; i < candidates.length; i++) ds[i] = candidates[i].d;
    const cutoff = kth(ds, room - 1);
    pool = candidates.filter((x) => x.d <= cutoff);
  }
  const seen = new Set<string>();
  const chosen = pool
    .sort((a, b) => a.d - b.d)
    .filter((x) => !seen.has(x.c.state.id) && Boolean(seen.add(x.c.state.id)))
    .slice(0, params.comps);
  if (chosen.length === 0) return null;
  const d0 = chosen[0].d;
  // Widen the kernel until enough comparables carry weight, so one or two careers cannot decide everything.
  let bandwidth = params.bandwidth;
  let weights = chosen.map(({ d }) => Math.exp(-(d - d0) / (2 * bandwidth)));
  const effective = (w: number[]) => w.reduce((a, b) => a + b, 0) ** 2 / w.reduce((a, b) => a + b * b, 0);
  while (effective(weights) < Math.min(params.minEffective, chosen.length * 0.8) && bandwidth < 1000) {
    bandwidth *= 1.5;
    weights = chosen.map(({ d }) => Math.exp(-(d - d0) / (2 * bandwidth)));
  }

  const scales = chosen.map(({ c }) => {
    const byLevel = Math.log((Math.max(state.level, 0) + 1) / (Math.max(c.state.level, 0) + 1));
    const byRate = Math.log((Math.max(state.rate, 0) + 0.03) / (Math.max(c.state.rate, 0) + 0.03));
    const ratio = Math.exp((1 - params.scaleOnRate) * byLevel + params.scaleOnRate * byRate);
    // Draft slot and height carry information the box score does not: higher picks and taller players have
    // outrun their comparables historically.
    const pickAdj = params.pickEffect * (c.state.pick - state.pick);
    const htGap = state.height != null && c.state.height != null ? Math.min(Math.max(state.height - c.state.height, -4), 4) : 0;
    return Math.min(Math.max(ratio, 0.5), 2) ** params.scaling * Math.exp(pickAdj + params.heightEffect * htGap);
  });

  // Known futures, scaled. null where the comparable's career is still going past the data.
  const raw = chosen.map(({ c }, i) =>
    Array.from({ length: horizon }, (_, h) => {
      const v = c.future[h] ?? (c.state.year + h + 1 > index.lastComplete ? null : 0);
      // Before the target's checkpoint year in a backtest, everything after maxYear is unknown to the model.
      if (maxYear != null && c.state.year + h + 1 > maxYear) return null;
      return v == null ? null : v * scales[i];
    }),
  );

  // Average shape of the known futures, used to extend careers that run past the data.
  const curve = Array.from({ length: horizon + 1 }, (_, h) => {
    if (h === 0) {
      let t = 0;
      let w = 0;
      chosen.forEach(({ c }, i) => {
        t += weights[i] * c.state.level * scales[i];
        w += weights[i];
      });
      return t / w;
    }
    // Only comparables whose season h years on has been played, retired or not. Leaving out just the active
    // ones would keep recent busts and drop recent stars, which drags the curve down.
    let t = 0;
    let w = 0;
    raw.forEach((path, i) => {
      const v = path[h - 1];
      if (v == null || chosen[i].c.state.year + h > (maxYear ?? index.lastComplete)) return;
      t += weights[i] * v;
      w += weights[i];
    });
    return w > 0 ? t / w : null;
  });
  // Fill gaps in the curve (every comparable censored) by carrying the last known ratio forward.
  for (let h = 1; h <= horizon; h++) if (curve[h] == null) curve[h] = (curve[h - 1] ?? 0) * 0.85;

  const paths = raw.map((path, i) => {
    const out: number[] = [];
    let baseH = 0;
    let base = chosen[i].c.state.level * scales[i];
    for (let h = 1; h <= horizon; h++) {
      const v = path[h - 1];
      if (v != null) {
        out.push(v);
        baseH = h;
        base = h >= 2 && path[h - 2] != null ? (v + (path[h - 2] as number)) / 2 : v;
      } else {
        const from = curve[baseH] as number;
        out.push(from > 0 ? (base * (curve[h] as number)) / from : 0);
      }
    }
    return out;
  });

  const wTotal = weights.reduce((a, b) => a + b, 0);
  const compMean = Array.from({ length: horizon }, (_, h) => paths.reduce((t, p, i) => t + weights[i] * p[h], 0) / wTotal);

  // Blend with a plain aging curve for players of this age and level. The curve is steadier a season or two out;
  // the comparables know more about the long run.
  // The curve is interpolated between level bands so a small change in level cannot jump bands.
  const self = exclude ? index.byAge.get(state.age)?.entries.find((e) => e.state.id === exclude) : undefined;
  const bandRatio = (b: number, h: number) => {
    const aging = index.curves.get(`${state.age}:${b}`);
    if (!aging) return null;
    let sum = aging.sum[h];
    let n = aging.n[h];
    const own = self ? curveContribution(self, index.lastComplete, h) : null;
    if (own != null && band(self!.state.level) === b) {
      sum -= own;
      n--;
    }
    return n >= 5 ? sum / n : null;
  };
  const level = Math.max(state.level, 0.5);
  const upper = BAND_CENTERS.findIndex((c) => c > level);
  const lo = upper === -1 ? BAND_CENTERS.length - 1 : Math.max(upper - 1, 0);
  const hi = upper === -1 ? lo : upper;
  const f = hi === lo ? 0 : Math.min(Math.max((level - BAND_CENTERS[lo]) / (BAND_CENTERS[hi] - BAND_CENTERS[lo]), 0), 1);
  const mean = compMean.map((m, h) => {
    const rl = bandRatio(lo, h);
    const rh = bandRatio(hi, h);
    const ratio = rl != null && rh != null ? (1 - f) * rl + f * rh : (rl ?? rh);
    if (ratio == null) return m;
    const t = Math.min(h / 4, 1);
    const a = params.blendNear + (params.blendFar - params.blendNear) * t;
    return a * m + (1 - a) * ratio * level;
  });
  // Shift every path so the simulations average out to the blended projection.
  for (const p of paths) for (let h = 0; h < horizon; h++) p[h] = compMean[h] > 0 ? (p[h] * mean[h]) / compMean[h] : mean[h];

  let rNum = 0;
  let rW = 0;
  chosen.forEach(({ c }, i) => {
    if (c.rateNext == null) return;
    rNum += weights[i] * (c.rateNext - c.state.rate);
    rW += weights[i];
  });
  const nextRate = state.rate + (rW > 0 ? rNum / rW : 0);

  return {
    mean,
    nextRate,
    comps: chosen.map(({ c }, i) => ({
      id: c.state.id,
      name: c.state.name,
      year: c.state.year,
      age: c.state.age,
      weight: weights[i] / wTotal,
      scale: scales[i],
      path: paths[i],
    })),
    paths,
    weights: weights.map((w) => w / wTotal),
    state,
  };
};

/** Small deterministic random generator, so the page shows the same numbers on every load. */
export const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const gaussian = (random: () => number) => {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
};

/** Draws one future career: a comparable picked by weight, with season-to-season noise on top. */
export const samplePath = (projection: Projection, params: Params, random: () => number): number[] => {
  let r = random();
  let i = 0;
  while (i < projection.weights.length - 1 && r > projection.weights[i]) {
    r -= projection.weights[i];
    i++;
  }
  return projection.paths[i].map((v) => v * Math.exp(params.noise * gaussian(random) - params.noise ** 2 / 2));
};

export const quantile = (sorted: number[], q: number) => {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

export const seasonsFromHistory = (player: HistoryPlayer, throughYear: number) =>
  player.s.filter((r) => r[0] <= throughYear).map(toTarget);
