// Game-by-game log of the model's outlook. Each time Wembanyama's season games change, the cron (or the
// on-request refresh) runs the model on the new stats and appends one entry to KV. The /model page reads it.
import { type StoredProjection, label, projectCrossover } from "@/lib/model/crossover";
import projectionData from "@/lib/model/projection.json";
import type { CareerStats, Player } from "@/lib/stats.server";

export const TRACK_KEY = "model-track:v1";

type Line = { games: number; minutes: number; winShares: number; career: number };

export type TrackEntry = {
  /** When the stats were pulled, the morning after the game. */
  date: string;
  season: string;
  wemby: Line;
  horford: Line;
  /** Share of simulated careers where he passes Horford. */
  chance: number;
  /** Median crossover season among those careers. */
  median: string | null;
  /** Projected Win Shares for the full season. */
  seasonTotal: number;
};

const projection = projectionData as StoredProjection;
const endYearOf = (season: string) => Number.parseInt(season.slice(0, 4), 10) + 1;

const seasonLine = (p: Player, season: string): Line => {
  const s = p.seasons.find((x) => x.season.slice(0, 4) === season.slice(0, 4));
  const minutes = s?.minutes ?? (s?.winSharesPer48 ? (s.winShares * 48) / s.winSharesPer48 : 0);
  return { games: s?.games ?? 0, minutes: Math.round(minutes), winShares: s?.winShares ?? 0, career: p.winShares };
};

/** Runs the model on one set of stats. */
export const entryFor = (stats: CareerStats): TrackEntry => {
  const asOf = new Date(stats.updatedAt);
  const model = projectCrossover(projection, stats.wemby, stats.horford, asOf);
  const season = model.current;
  return {
    date: stats.updatedAt,
    season,
    wemby: seasonLine(stats.wemby, season),
    horford: seasonLine(stats.horford, season),
    chance: Math.round(model.chance * 1000) / 1000,
    median: model.median,
    seasonTotal: Math.round(model.wemby.total * 10) / 10,
  };
};

// Points from before the tracker existed: the eve of the opener, and Basketball Reference totals after games 6
// and 8. Game 7 is missing because no snapshot of it was kept.
const SEED: { date: string; wemby: [number, number, number]; horford: [number, number, number] }[] = [
  { date: "2026-10-20T10:15:00.000Z", wemby: [0, 0, 0], horford: [0, 0, 0] },
  { date: "2026-11-01T10:15:00.000Z", wemby: [6, 194, 1.0], horford: [5, 90, 0.1] },
  { date: "2026-11-05T10:15:00.000Z", wemby: [8, 253, 1.5], horford: [6, 112, 0.1] },
];

const withSeason = (p: Player, season: string, [games, minutes, winShares]: [number, number, number]): Player => {
  const before = p.seasons.filter((s) => endYearOf(s.season) < endYearOf(season));
  const prior = before.reduce((t, s) => t + s.winShares, 0);
  return {
    games: before.reduce((t, s) => t + (s.games ?? 0), 0) + games,
    winShares: Math.round((prior + winShares) * 10) / 10,
    seasons: [
      ...before,
      { season, games, minutes, winShares, winSharesPer48: minutes ? (winShares * 48) / minutes : null },
    ],
  };
};

const seedEntries = (stats: CareerStats): TrackEntry[] => {
  const current = stats.wemby.seasons.find((s) => s.season.startsWith("2026"))?.season ?? "2026-27";
  return SEED.map((s) =>
    entryFor({
      updatedAt: s.date,
      wemby: withSeason(stats.wemby, current, s.wemby),
      horford: withSeason(stats.horford, current, s.horford),
    }),
  );
};

const readTrack = async (kv: KVNamespace): Promise<TrackEntry[]> => {
  const track = await kv.get<TrackEntry[]>(TRACK_KEY, "json");
  return Array.isArray(track) ? track : [];
};

/** Adds an entry when this season's games have changed since the last one. */
export const recordEntry = async (kv: KVNamespace, stats: CareerStats): Promise<void> => {
  try {
    const entry = entryFor(stats);
    if (entry.wemby.games === 0) return;
    let track = await readTrack(kv);
    if (track.length === 0 && entry.season === label(2027)) track = seedEntries(stats);
    const last = track.filter((t) => t.season === entry.season).at(-1);
    if (last && last.wemby.games === entry.wemby.games && last.wemby.winShares === entry.wemby.winShares) return;
    // A later pull for a game already logged (a stat correction) replaces it.
    track = track.filter((t) => !(t.season === entry.season && t.wemby.games === entry.wemby.games));
    track.push(entry);
    await kv.put(TRACK_KEY, JSON.stringify(track));
  } catch (error) {
    console.error("Model tracker update failed", error);
  }
};

/** This season's log, oldest first. Falls back to the seed points before the first cron run. */
export const getTrack = async (kv: KVNamespace, stats: CareerStats): Promise<TrackEntry[]> => {
  let track: TrackEntry[] = [];
  try {
    track = await readTrack(kv);
  } catch {
    // Show the seed points.
  }
  const asOf = new Date(stats.updatedAt);
  const season = label(asOf.getUTCMonth() >= 9 ? asOf.getUTCFullYear() + 1 : asOf.getUTCFullYear());
  if (track.length === 0 && season === label(2027)) track = seedEntries(stats);
  return track.filter((t) => t.season === season).sort((a, b) => a.wemby.games - b.wemby.games);
};
