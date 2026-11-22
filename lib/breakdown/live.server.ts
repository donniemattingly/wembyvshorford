// This season's box-score totals for the /breakdown page, scraped once a day alongside the career stats.
// Finished seasons come from lib/breakdown/seasons.json; this fills in the season in progress.
//
// The season's box-score totals come from the player's own page. The team and league totals the formula needs come
// from the league page. When those can't be read, or the Win Shares rebuilt from them miss the ones Basketball
// Reference lists, the line is measured against the team's last full season instead and the split is calibrated to
// the listed offensive and defensive Win Shares. Either way the season in progress stays on the page and its
// totals always match Basketball Reference. Each run's outcome is kept in KV under STATUS_KEY.
import { fetchBbref } from "@/lib/bbref/fetch.server";
import { type Box, type TeamContext, winShares } from "@/lib/breakdown/engine";
import seasonsData from "@/lib/breakdown/seasons.json";
import type { CareerStats, PlayerPages } from "@/lib/stats.server";

export const LIVE_KEY = "breakdown-live:v1";
export const STATUS_KEY = "breakdown-status:v1";

export type SeasonLine = {
  season: string;
  team: string;
  games: number;
  box: Box;
  context: string;
  /** Set when the context is an earlier season's: the listed Win Shares the split is calibrated to. */
  target?: { ows: number; dws: number };
};

/** One game from a player's log. */
export type GameLine = {
  date: string;
  /** Opponent abbreviation. */
  opp: string;
  away: boolean;
  /** As listed, e.g. "W, 118-104". */
  result: string;
  box: Box;
};

export type LiveBreakdown = {
  updatedAt: string;
  players: { wemby?: SeasonLine; horford?: SeasonLine };
  contexts: Record<string, TeamContext>;
  /** This season's games, measured against the season's team totals. */
  games?: { wemby?: GameLine[]; horford?: GameLine[] };
};

// Basketball Reference has renamed some columns over the years; try each spelling.
const COLUMNS: Record<keyof Box | "g", string[]> = {
  g: ["games", "g"],
  mp: ["mp"],
  fg: ["fg"],
  fga: ["fga"],
  fg3: ["fg3", "x3p"],
  fg3a: ["fg3a", "x3pa"],
  ft: ["ft"],
  fta: ["fta"],
  orb: ["orb"],
  drb: ["drb"],
  ast: ["ast"],
  stl: ["stl"],
  blk: ["blk"],
  tov: ["tov"],
  pf: ["pf"],
  pts: ["pts"],
};

const cell = (row: string, stat: string): string | null => {
  const match = row.match(new RegExp(`data-stat=["']${stat}["'][^>]*>((?:(?!</t[dh]>)[\\s\\S])*)</t[dh]>`));
  return match ? match[1].replace(/<[^>]+>/g, "").trim() : null;
};

const number = (row: string, key: keyof typeof COLUMNS, prefix = ""): number => {
  for (const name of COLUMNS[key]) {
    for (const stat of prefix ? [prefix + name, name] : [name]) {
      const value = Number.parseFloat(cell(row, stat)?.replace(/,/g, "") ?? "");
      if (Number.isFinite(value)) return value;
    }
  }
  throw new Error(`${key} was not found`);
};

/** Everything but games and minutes, which game logs write differently. */
const countsOf = (row: string, prefix = ""): Omit<Box, "mp"> => ({
  fg: number(row, "fg", prefix),
  fga: number(row, "fga", prefix),
  fg3: number(row, "fg3", prefix),
  fg3a: number(row, "fg3a", prefix),
  ft: number(row, "ft", prefix),
  fta: number(row, "fta", prefix),
  orb: number(row, "orb", prefix),
  drb: number(row, "drb", prefix),
  ast: number(row, "ast", prefix),
  stl: number(row, "stl", prefix),
  blk: number(row, "blk", prefix),
  tov: number(row, "tov", prefix),
  pf: number(row, "pf", prefix),
  pts: number(row, "pts", prefix),
});

const boxOf = (row: string, prefix = ""): Box & { g: number } => ({
  g: number(row, "g"),
  mp: number(row, "mp"),
  ...countsOf(row, prefix),
});

const rows = (html: string) => html.match(/<tr[\s>][\s\S]*?<\/tr>/g) ?? [];

const isInteger = (v: number) => Math.abs(v - Math.round(v)) < 1e-9;
const isTotals = (b: Box & { g: number }) => Object.values(b).every(isInteger);

/** Tables by id, leaving out playoff tables. */
const tables = (html: string) =>
  [...html.matchAll(/<table[^>]+id=["']([^"']+)["'][\s\S]*?<\/table>/g)]
    .map(([body, id]) => ({ id, body }))
    .filter((t) => !/post|playoff/i.test(t.id));

/**
 * The player's season totals from his page. Rather than trusting one table id, it takes the row for that season whose
 * counting stats are all whole numbers (the per-game, per-36 and per-100 tables have decimals), preferring a table
 * whose id starts with "totals".
 */
export const parseSeasonTotals = (html: string, season: string): { team: string; games: number; box: Box } | null => {
  const found: { id: string; row: string; box: Box & { g: number } }[] = [];
  for (const t of tables(html)) {
    for (const row of rows(t.body)) {
      const year = cell(row, "year_id") ?? cell(row, "season");
      if (!year?.startsWith(season)) continue;
      try {
        const box = boxOf(row);
        if (isTotals(box) && box.mp > 0) found.push({ id: t.id, row, box });
      } catch {
        // Not a counting-stats row.
      }
    }
  }
  const hit = found.find((f) => /^totals/.test(f.id)) ?? found[0];
  if (!hit) throw new Error(`No ${season} totals row was found`);
  const team =
    [cell(hit.row, "team_name_abbr"), cell(hit.row, "team_id"), hit.row.match(/\/teams\/([A-Z]{3})\//)?.[1]].find(
      (t) => t && /^[A-Z]{3}$/.test(t),
    ) ?? "";
  // A traded player's combined row has no single team to measure him against.
  if (!team) return null;
  const { g, ...box } = hit.box;
  return { team, games: g, box };
};

/** Team and opponent totals for one team, and the league average, from the league season page. */
export const parseLeagueTotals = (html: string, team: string): TeamContext => {
  const teamRow = (body: string) => rows(body).find((r) => new RegExp(`/teams/${team}/`).test(r));
  const leagueRow = (body: string) => rows(body).find((r) => /League Average/.test(r));
  // Season totals, not per game: whole numbers throughout.
  const totalsRow = (row: string | undefined, prefix = "") => {
    if (!row) return null;
    try {
      const box = boxOf(row, prefix);
      return isTotals(box) ? box : null;
    } catch {
      return null;
    }
  };
  let ours: (Box & { g: number }) | null = null;
  let league: (Box & { g: number }) | null = null;
  let opp: (Box & { g: number }) | null = null;
  for (const t of tables(html)) {
    if (/opp/i.test(t.id)) opp ??= totalsRow(teamRow(t.body), "opp_");
    else if (/team/i.test(t.id) || leagueRow(t.body)) {
      const tr = totalsRow(teamRow(t.body));
      const lr = totalsRow(leagueRow(t.body));
      if (tr && lr && !ours) [ours, league] = [tr, lr];
    }
  }
  if (!ours || !league || !opp) throw new Error(`League page totals for ${team} were not found`);
  const { g: _g, ...oppBox } = opp;
  return { team: ours, opp: oppBox, league };
};

type StoredContexts = { contexts: Record<string, TeamContext>; players: Record<string, { team: string; context: string }[]> };
const stored = seasonsData as unknown as StoredContexts;

/** The team's most recent full season in seasons.json, for when this season's team totals can't be read. */
const fallbackContext = (team: string, season: string): { key: string; context: TeamContext } | null => {
  const endYear = Number.parseInt(season.slice(0, 4), 10) + 1;
  for (let year = endYear - 1; year >= endYear - 3; year--) {
    const key = `${year} ${team}`;
    if (stored.contexts[key]) return { key, context: stored.contexts[key] };
  }
  return null;
};

const minutes = (text: string | null): number => {
  const [m, sec = "0"] = (text ?? "").split(":");
  const value = Number.parseInt(m, 10) + Number.parseInt(sec, 10) / 60;
  return Number.isFinite(value) ? value : 0;
};

/** Regular-season games from a player's game log page. Games he did not play are left out. */
export const parseGameLog = (html: string): GameLine[] => {
  // The regular-season log is the first non-playoff table with dated rows.
  for (const t of tables(html)) {
    const games = gamesIn(t.body);
    if (games.length) return games;
  }
  throw new Error("Game log table was not found");
};

const gamesIn = (log: string): GameLine[] => {
  const games: GameLine[] = [];
  for (const row of rows(log)) {
    const date = cell(row, "date") ?? cell(row, "date_game");
    const mp = minutes(cell(row, "mp"));
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || mp <= 0) continue;
    let counts: Omit<Box, "mp">;
    try {
      counts = countsOf(row);
    } catch {
      continue;
    }
    games.push({
      date,
      opp: cell(row, "opp_name_abbr") ?? cell(row, "opp_id") ?? "",
      away: cell(row, "game_location") === "@",
      result: (cell(row, "game_result") ?? "").replace(/\s+/g, " "),
      box: { mp, ...counts },
    });
  }
  return games;
};

const COUNTED: (keyof Box)[] = ["fg", "fga", "fg3", "fg3a", "ft", "fta", "orb", "drb", "ast", "stl", "blk", "tov", "pf", "pts"];

/** True when a game log adds up to the season totals row. */
export const logMatchesSeason = (games: GameLine[], season: SeasonLine): boolean =>
  games.length === season.games &&
  COUNTED.every((k) => games.reduce((t, g) => t + g.box[k], 0) === season.box[k]) &&
  Math.abs(games.reduce((t, g) => t + g.box.mp, 0) - season.box.mp) <= Math.max(2, games.length / 2);

const gameLogUrl = (playerUrl: string, season: string) =>
  playerUrl.replace(/\.html$/, `/gamelog/${Number.parseInt(season.slice(0, 4), 10) + 1}`);

const leagueUrl = (season: string) =>
  `https://www.basketball-reference.com/leagues/NBA_${Number.parseInt(season.slice(0, 4), 10) + 1}.html`;

const PLAYER_URLS = {
  wemby: "https://www.basketball-reference.com/players/w/wembavi01.html",
  horford: "https://www.basketball-reference.com/players/h/horfoal01.html",
};

export type BreakdownStatus = { at: string; season: string; wemby: string; horford: string };

export const refreshBreakdown = async (kv: KVNamespace, pages: PlayerPages, stats: CareerStats): Promise<void> => {
  const season = stats.wemby.seasons.at(-1)?.season;
  if (!season) return;
  const status: BreakdownStatus = { at: stats.updatedAt, season, wemby: "not run", horford: "not run" };
  try {
    let leagueHtml: string | null = null;
    let leagueError = "";
    try {
      leagueHtml = await fetchBbref(leagueUrl(season));
    } catch (error) {
      leagueError = `league page: ${error instanceof Error ? error.message : error}`;
    }

    const previous = await kv.get<LiveBreakdown>(LIVE_KEY, "json");
    const next: LiveBreakdown = { updatedAt: stats.updatedAt, players: {}, contexts: {}, games: {} };
    const keep = (name: "wemby" | "horford") => {
      const kept = previous?.players[name];
      if (!kept || kept.season !== season) return;
      next.players[name] = kept;
      next.contexts[kept.context] = previous.contexts[kept.context];
      if (previous.games?.[name]) next.games![name] = previous.games[name];
    };

    for (const name of ["wemby", "horford"] as const) {
      const listed = stats[name].seasons.find((s) => s.season === season);
      if (!listed) {
        status[name] = "no games this season";
        continue;
      }
      let line: ReturnType<typeof parseSeasonTotals>;
      try {
        line = parseSeasonTotals(pages[name], season);
      } catch (error) {
        status[name] = `totals: ${error instanceof Error ? error.message : error}`;
        console.error(`Breakdown totals for ${name} failed`, error);
        keep(name);
        continue;
      }
      if (!line) {
        status[name] = "traded: no single team";
        keep(name);
        continue;
      }

      // This season's team totals when they read cleanly and reproduce the listed Win Shares.
      let exact: TeamContext | null = null;
      let why = leagueError;
      if (leagueHtml) {
        try {
          const context = parseLeagueTotals(leagueHtml, line.team);
          const { ows, dws } = winShares(line.box, context);
          if (Math.abs(ows + dws - listed.winShares) <= 0.25) exact = context;
          else why = `check: rebuilt ${(ows + dws).toFixed(2)}, listed ${listed.winShares}`;
        } catch (error) {
          why = `league page: ${error instanceof Error ? error.message : error}`;
        }
      }

      let seasonLine: SeasonLine;
      if (exact) {
        const key = `${season} ${line.team}`;
        seasonLine = { season, ...line, context: key };
        next.contexts[key] = exact;
        status[name] = `exact through ${line.games} games`;
      } else {
        const fallback = fallbackContext(line.team, season);
        if (!fallback) {
          status[name] = `${why}; no earlier ${line.team} season to fall back on`;
          keep(name);
          continue;
        }
        // Calibrate to the listed split; without it, to the listed total in the rebuilt proportions.
        const rebuilt = winShares(line.box, fallback.context);
        const target =
          listed.ows != null && listed.dws != null
            ? { ows: listed.ows, dws: listed.dws }
            : { ows: rebuilt.ows + (listed.winShares - rebuilt.ows - rebuilt.dws) / 2, dws: rebuilt.dws + (listed.winShares - rebuilt.ows - rebuilt.dws) / 2 };
        seasonLine = { season, ...line, context: fallback.key, target };
        next.contexts[fallback.key] = fallback.context;
        status[name] = `calibrated through ${line.games} games (${why})`;
        console.error(`Breakdown for ${name} fell back to ${fallback.key}: ${why}`);
      }
      next.players[name] = seasonLine;

      // The game log is kept only if it adds up to the season totals.
      try {
        const games = parseGameLog(await fetchBbref(gameLogUrl(PLAYER_URLS[name], season)));
        if (logMatchesSeason(games, seasonLine)) next.games![name] = games;
        else status[name] += "; game log does not add up";
      } catch (error) {
        status[name] += `; game log: ${error instanceof Error ? error.message : error}`;
      }
    }
    if (next.players.wemby || next.players.horford) await kv.put(LIVE_KEY, JSON.stringify(next));
  } catch (error) {
    console.error("Breakdown refresh failed", error);
    status.wemby = status.wemby === "not run" ? `failed: ${error instanceof Error ? error.message : error}` : status.wemby;
  }
  try {
    await kv.put(STATUS_KEY, JSON.stringify(status));
  } catch {
    // The status is only for diagnosis.
  }
};

export const getLiveBreakdown = async (kv: KVNamespace): Promise<LiveBreakdown | null> => {
  try {
    return await kv.get<LiveBreakdown>(LIVE_KEY, "json");
  } catch {
    return null;
  }
};
