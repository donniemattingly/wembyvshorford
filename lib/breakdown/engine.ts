// Win Shares from a box-score line, and how much each stat in that line contributed to them.
//
// winShares() follows Basketball Reference's method (Dean Oliver's points produced, individual possessions and
// defensive rating, then marginal offense and defense over marginal points per win). Given the same totals it
// matches Basketball Reference to the tenth.
//
// Win Shares are not a sum of per-stat values, so attribute() uses Aumann-Shapley attribution: grow the box line
// from nothing to the real line in small steps and credit each stat with its share of the change at every step.
// The parts always add up to the total. The one piece left at an empty line is the defensive credit a player gets
// for minutes on the floor while his team defends, reported as `floor`.

/** Counting stats, as Basketball Reference lists them. Team totals use the same shape. */
export type Box = {
  mp: number;
  fg: number;
  fga: number;
  fg3: number;
  fg3a: number;
  ft: number;
  fta: number;
  orb: number;
  drb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  pts: number;
};

/** Team, opponent and league-average season totals. `mp` is total player minutes (240 a game). */
export type TeamContext = { team: Box & { g: number }; opp: Box; league: Box & { g: number } };

/** Each box-score event a player can add, in display order. */
export const EVENTS = [
  "fg2",
  "fg2Miss",
  "fg3",
  "fg3Miss",
  "ft",
  "ftMiss",
  "ast",
  "orb",
  "tov",
  "drb",
  "stl",
  "blk",
  "pf",
] as const;
export type EventKey = (typeof EVENTS)[number];
export type Events = Record<EventKey, number>;

export type Attribution = {
  ows: number;
  dws: number;
  ws: number;
  mp: number;
  games: number;
  /** Win Shares credited to each event. */
  parts: Events;
  /** How many of each event. */
  counts: Events;
  /** Defensive credit for minutes on the floor, independent of any box-score stat. */
  floor: number;
};

export const eventsOf = (b: Box): Events => ({
  fg2: b.fg - b.fg3,
  fg2Miss: b.fga - b.fg3a - (b.fg - b.fg3),
  fg3: b.fg3,
  fg3Miss: b.fg3a - b.fg3,
  ft: b.ft,
  ftMiss: b.fta - b.ft,
  ast: b.ast,
  orb: b.orb,
  tov: b.tov,
  drb: b.drb,
  stl: b.stl,
  blk: b.blk,
  pf: b.pf,
});

const boxOf = (e: Events, mp: number): Box => {
  const fg = e.fg2 + e.fg3;
  return {
    mp,
    fg,
    fga: fg + e.fg2Miss + e.fg3Miss,
    fg3: e.fg3,
    fg3a: e.fg3 + e.fg3Miss,
    ft: e.ft,
    fta: e.ft + e.ftMiss,
    orb: e.orb,
    drb: e.drb,
    ast: e.ast,
    stl: e.stl,
    blk: e.blk,
    tov: e.tov,
    pf: e.pf,
    pts: 2 * e.fg2 + 3 * e.fg3 + e.ft,
  };
};

/** Basketball Reference's possession estimate, averaged over both teams. */
const possessions = (t: Box, o: Box) => {
  const one = (a: Box, b: Box) => a.fga + 0.4 * a.fta - 1.07 * (a.orb / (a.orb + b.drb)) * (a.fga - a.fg) + a.tov;
  return 0.5 * (one(t, o) + one(o, t));
};

/** Everything about the team and league that does not depend on the player. */
const prepare = ({ team: t, opp: o, league: lg }: TeamContext) => {
  const tmPoss = possessions(t, o);
  const lgPoss = possessions(lg, lg);
  const pace = (48 * tmPoss) / (t.mp / 5);
  const lgPace = (48 * lgPoss) / (lg.mp / 5);
  const lgPPP = lg.pts / lgPoss;
  const tmScPoss = t.fg + (1 - (1 - t.ft / t.fta) ** 2) * t.fta * 0.4;
  const tmOrbPct = t.orb / (t.orb + o.drb);
  const tmPlay = tmScPoss / (t.fga + t.fta * 0.4 + t.tov);
  const orbWeight = ((1 - tmOrbPct) * tmPlay) / ((1 - tmOrbPct) * tmPlay + tmOrbPct * (1 - tmPlay));
  const dOrbPct = o.orb / (o.orb + t.drb);
  const dFgPct = o.fg / o.fga;
  const fmWt = (dFgPct * (1 - dOrbPct)) / (dFgPct * (1 - dOrbPct) + (1 - dFgPct) * dOrbPct);
  return {
    t,
    o,
    tmPoss,
    lgPPP,
    tmScPoss,
    tmOrbPct,
    tmPlay,
    orbWeight,
    dOrbPct,
    fmWt,
    tmDRtg: (100 * o.pts) / tmPoss,
    dPtsPerScPoss: o.pts / (o.fg + (1 - (1 - o.ft / o.fta) ** 2) * o.fta * 0.4),
    marginalPtsPerWin: 0.32 * (lg.pts / lg.g) * (pace / lgPace),
  };
};
type Prepared = ReturnType<typeof prepare>;

const EPS = 1e-9;

const compute = (p: Box, c: Prepared) => {
  const { t, o } = c;
  const fta = p.fta + EPS;
  const fga = p.fga + EPS;
  const share = p.mp / (t.mp / 5);

  // Offense: points produced and individual possessions.
  const qAst =
    share * (1.14 * ((t.ast - p.ast) / t.fg)) +
    (((t.ast / t.mp) * p.mp * 5 - p.ast) / ((t.fg / t.mp) * p.mp * 5 - p.fg)) * (1 - share);
  const assisted = 1 - 0.5 * ((p.pts - p.ft) / (2 * fga)) * qAst;
  const astShare = 0.5 * ((t.pts - t.ft - (p.pts - p.ft)) / (2 * (t.fga - p.fga))) * p.ast;
  const ftScored = (1 - (1 - p.ft / fta) ** 2) * 0.4 * fta;
  const orbAdj = 1 - (t.orb / c.tmScPoss) * c.orbWeight * c.tmPlay;
  const orbPart = p.orb * c.orbWeight * c.tmPlay;

  const scPoss = (p.fg * assisted + astShare + ftScored) * orbAdj + orbPart;
  const missPoss = (p.fga - p.fg) * (1 - 1.07 * c.tmOrbPct);
  const ftMissPoss = (1 - p.ft / fta) ** 2 * 0.4 * fta;
  const totPoss = scPoss + missPoss + ftMissPoss + p.tov;

  const ppFg = 2 * (p.fg + 0.5 * p.fg3) * assisted;
  const ppAst = 2 * ((t.fg - p.fg + 0.5 * (t.fg3 - p.fg3)) / (t.fg - p.fg)) * astShare;
  const ppOrb = orbPart * (t.pts / c.tmScPoss);
  const pProd = (ppFg + ppAst + p.ft) * orbAdj + ppOrb;

  const ows = (pProd - 0.92 * c.lgPPP * totPoss) / c.marginalPtsPerWin;

  // Defense: stops, individual defensive rating, then marginal defense over the minutes played.
  const stops1 = p.stl + p.blk * c.fmWt * (1 - 1.07 * c.dOrbPct) + p.drb * (1 - c.fmWt);
  const stops2 =
    (((o.fga - o.fg - t.blk) / t.mp) * c.fmWt * (1 - 1.07 * c.dOrbPct) + (o.tov - t.stl) / t.mp) * p.mp +
    (p.pf / t.pf) * 0.4 * o.fta * (1 - o.ft / o.fta) ** 2;
  const stopPct = ((stops1 + stops2) * t.mp) / (c.tmPoss * (p.mp + EPS));
  const dRtg = c.tmDRtg + 0.2 * (100 * c.dPtsPerScPoss * (1 - stopPct) - c.tmDRtg);
  const dws = ((p.mp / t.mp) * c.tmPoss * (1.08 * c.lgPPP - dRtg / 100)) / c.marginalPtsPerWin;

  return { ows, dws };
};

export const winShares = (line: Box, ctx: TeamContext) => compute(line, prepare(ctx));

const zero = (): Events => Object.fromEntries(EVENTS.map((k) => [k, 0])) as Events;

/** Splits a stat line's Win Shares across the stats in it. */
export const attribute = (line: Box, ctx: TeamContext, games = 0, steps = 48): Attribution => {
  const c = prepare(ctx);
  const counts = eventsOf(line);
  const total = (e: Events) => {
    const { ows, dws } = compute(boxOf(e, line.mp), c);
    return ows + dws;
  };
  const parts = zero();
  const h = 1e-3;
  const x = zero();
  for (let i = 0; i < steps; i++) {
    const a = (i + 0.5) / steps;
    for (const k of EVENTS) x[k] = a * counts[k];
    for (const k of EVENTS) {
      if (!counts[k]) continue;
      const v = x[k];
      x[k] = v + h;
      const up = total(x);
      x[k] = v - h;
      const down = total(x);
      x[k] = v;
      parts[k] += (((up - down) / (2 * h)) * counts[k]) / steps;
    }
  }
  const { ows, dws } = compute(line, c);
  const ws = ows + dws;
  // Whatever the steps leave over (a hair, from rounding) goes to the empty-line credit so the parts sum exactly.
  const floor = ws - EVENTS.reduce((s, k) => s + parts[k], 0);
  return { ows, dws, ws, mp: line.mp, games, parts, counts, floor };
};

/** Adds attributions together, for a career or any run of seasons or games. */
export const sumAttributions = (list: Attribution[]): Attribution => {
  const out: Attribution = { ows: 0, dws: 0, ws: 0, mp: 0, games: 0, parts: zero(), counts: zero(), floor: 0 };
  for (const a of list) {
    out.ows += a.ows;
    out.dws += a.dws;
    out.ws += a.ws;
    out.mp += a.mp;
    out.games += a.games;
    out.floor += a.floor;
    for (const k of EVENTS) {
      out.parts[k] += a.parts[k];
      out.counts[k] += a.counts[k];
    }
  }
  return out;
};

const OFFENSE: EventKey[] = ["fg2", "fg2Miss", "fg3", "fg3Miss", "ft", "ftMiss", "ast", "orb", "tov"];

/**
 * Moves an attribution onto known offensive and defensive Win Shares, for a line measured against approximate team
 * totals (an earlier season's). The offensive gap comes from league scoring levels, so it is shared across the
 * offensive stats in proportion to their size. The defensive gap comes almost entirely from how good the team's
 * defense is, which is what the floor-time row measures, so it goes there. Tested on past seasons measured against
 * the season before, this lands within a few hundredths on most stats.
 */
export const calibrate = (a: Attribution, target: { ows: number; dws: number }): Attribution => {
  const parts = { ...a.parts };
  const gap = target.ows - a.ows;
  const weight = OFFENSE.reduce((s, k) => s + Math.abs(parts[k]), 0);
  if (weight) for (const k of OFFENSE) parts[k] += (gap * Math.abs(parts[k])) / weight;
  const floor = a.floor + (target.dws - a.dws) + (weight ? 0 : gap);
  return { ...a, parts, floor, ows: target.ows, dws: target.dws, ws: target.ows + target.dws };
};
