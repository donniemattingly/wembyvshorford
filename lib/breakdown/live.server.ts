// This season's box-score totals for the /breakdown page, scraped once a day alongside the career stats.
// Finished seasons come from lib/breakdown/seasons.json; this fills in the season in progress.
//
// Each scrape is checked before it is stored: Win Shares rebuilt from the scraped totals must match the Win Shares
// Basketball Reference lists for the same season. If the markup changes and a number is misread, the check fails
// and the page keeps the last good totals (or the static file) instead of showing a wrong breakdown.
import { type Box, type TeamContext, winShares } from "@/lib/breakdown/engine";
import type { CareerStats, PlayerPages } from "@/lib/stats.server";

export const LIVE_KEY = "breakdown-live:v1";

export type SeasonLine = { season: string; team: string; games: number; box: Box; context: string };

export type LiveBreakdown = {
  updatedAt: string;
  players: { wemby?: SeasonLine; horford?: SeasonLine };
  contexts: Record<string, TeamContext>;
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

const boxOf = (row: string, prefix = ""): Box & { g: number } => ({
  g: number(row, "g"),
  mp: number(row, "mp"),
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

const table = (html: string, id: RegExp): string | null =>
  [...html.matchAll(/<table[^>]+id=["']([^"']+)["'][\s\S]*?<\/table>/g)].find(([, tid]) => id.test(tid))?.[0] ?? null;

const rows = (html: string) => html.match(/<tr[\s>][\s\S]*?<\/tr>/g) ?? [];

/** The player's row for one season from the totals table on his page. */
export const parseSeasonTotals = (html: string, season: string): { team: string; games: number; box: Box } | null => {
  const totals = table(html, /^totals(_stats)?$/);
  if (!totals) throw new Error("Totals table was not found");
  const row = rows(totals).find((r) => cell(r, "year_id")?.startsWith(season));
  if (!row) return null;
  const team = cell(row, "team_name_abbr") ?? cell(row, "team_id") ?? "";
  // A traded player's combined row has no single team to measure him against.
  if (!/^[A-Z]{3}$/.test(team)) return null;
  const { g, ...box } = boxOf(row);
  return { team, games: g, box };
};

/** Team and opponent totals for one team, and the league average, from the league season page. */
export const parseLeagueTotals = (html: string, team: string): TeamContext => {
  const teams = table(html, /^totals-team$/);
  const opps = table(html, /^totals-opponent$/);
  if (!teams || !opps) throw new Error("League totals tables were not found");
  const teamRow = (t: string) => rows(t).find((r) => new RegExp(`/teams/${team}/`).test(r));
  const leagueRow = (t: string) => rows(t).find((r) => /League Average/.test(r));
  const [tr, or, lr] = [teamRow(teams), teamRow(opps), leagueRow(teams)];
  if (!tr || !or || !lr) throw new Error(`Totals for ${team} or the league were not found`);
  const { g: _g, ...opp } = boxOf(or, "opp_");
  return { team: boxOf(tr), opp, league: boxOf(lr) };
};

const leagueUrl = (season: string) =>
  `https://www.basketball-reference.com/leagues/NBA_${Number.parseInt(season.slice(0, 4), 10) + 1}.html`;

/** Scrapes this season's totals and stores them if they reproduce Basketball Reference's Win Shares. */
export const refreshBreakdown = async (kv: KVNamespace, pages: PlayerPages, stats: CareerStats): Promise<void> => {
  try {
    const season = stats.wemby.seasons.at(-1)?.season;
    if (!season) return;
    const league = await fetch(leagueUrl(season), {
      headers: { "user-agent": "wembyvshorford/2.0 (+https://wembyvshorford.com)" },
    });
    if (!league.ok) throw new Error(`Basketball Reference returned ${league.status}`);
    const leagueHtml = await league.text();

    const previous = await kv.get<LiveBreakdown>(LIVE_KEY, "json");
    const next: LiveBreakdown = { updatedAt: stats.updatedAt, players: {}, contexts: {} };
    for (const name of ["wemby", "horford"] as const) {
      const listed = stats[name].seasons.find((s) => s.season === season);
      const line = listed && parseSeasonTotals(pages[name], season);
      if (!listed || !line) continue;
      const context = parseLeagueTotals(leagueHtml, line.team);
      const { ows, dws } = winShares(line.box, context);
      if (Math.abs(ows + dws - listed.winShares) > 0.25) {
        console.error(`Breakdown check failed for ${name}: rebuilt ${(ows + dws).toFixed(2)}, listed ${listed.winShares}`);
        const kept = previous?.players[name];
        if (kept) {
          next.players[name] = kept;
          next.contexts[kept.context] = previous.contexts[kept.context];
        }
        continue;
      }
      const key = `${season} ${line.team}`;
      next.players[name] = { season, ...line, context: key };
      next.contexts[key] = context;
    }
    if (next.players.wemby || next.players.horford) await kv.put(LIVE_KEY, JSON.stringify(next));
  } catch (error) {
    console.error("Breakdown refresh failed", error);
  }
};

export const getLiveBreakdown = async (kv: KVNamespace): Promise<LiveBreakdown | null> => {
  try {
    return await kv.get<LiveBreakdown>(LIVE_KEY, "json");
  } catch {
    return null;
  }
};
