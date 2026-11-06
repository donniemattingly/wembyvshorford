import { env } from "cloudflare:workers";

export const horfordUrl = "https://www.basketball-reference.com/players/h/horfoal01.html";
export const wembyUrl = "https://www.basketball-reference.com/players/w/wembavi01.html";

// The daily cron writes here and the page reads from here.
export const STATS_KEY = "career-stats:v3";

export type Season = {
  season: string;
  winShares: number;
  // Older snapshots in KV only stored win shares per season.
  games?: number;
  winSharesPer48?: number | null;
};

export type Player = {
  games: number;
  winShares: number;
  seasons: Season[];
};

export type CareerStats = {
  wemby: Player;
  horford: Player;
  updatedAt: string;
};

// Shown if KV is empty or unreadable.
const FALLBACK: CareerStats = {
  wemby: {
    winShares: 17.5,
    games: 181,
    seasons: [
      { season: "2023-24", winShares: 3.7 },
      { season: "2024-25", winShares: 3.8 },
      { season: "2025-26", winShares: 10 },
    ],
  },
  horford: {
    winShares: 119.4,
    games: 1183,
    seasons: [
      { season: "2007-08", winShares: 5.5 },
      { season: "2008-09", winShares: 6.8 },
      { season: "2009-10", winShares: 10.9 },
      { season: "2010-11", winShares: 10.1 },
      { season: "2011-12", winShares: 1.3 },
      { season: "2012-13", winShares: 8.8 },
      { season: "2013-14", winShares: 2.8 },
      { season: "2014-15", winShares: 8.7 },
      { season: "2015-16", winShares: 9.4 },
      { season: "2016-17", winShares: 6.3 },
      { season: "2017-18", winShares: 7.8 },
      { season: "2018-19", winShares: 7.5 },
      { season: "2019-20", winShares: 5.4 },
      { season: "2020-21", winShares: 1.6 },
      { season: "2021-22", winShares: 7.6 },
      { season: "2022-23", winShares: 6.3 },
      { season: "2023-24", winShares: 6.2 },
      { season: "2024-25", winShares: 4.4 },
      { season: "2025-26", winShares: 2.1 },
    ],
  },
  updatedAt: "2026-07-14T12:00:00.000Z",
};

// The regular season runs October through April. Outside it there is no season in progress.
export const seasonInProgress = (date: Date = new Date()): string | null => {
  const month = date.getUTCMonth();
  if (month > 3 && month < 9) return null;
  const startYear = month >= 9 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
};

const readStat = (html: string, stat: string): number => {
  const match = html.match(new RegExp(`data-stat=["']${stat}["'][^>]*>(?:<[^>]+>)*\\s*([^<]+)`));
  const value = Number.parseFloat(match?.[1] ?? "");
  if (!Number.isFinite(value)) throw new Error(`Career ${stat} was not found`);
  return value;
};

const readOptionalStat = (html: string, stat: string): number | null => {
  try {
    return readStat(html, stat);
  } catch {
    return null;
  }
};

const parsePlayer = (html: string): Player => {
  const totals = html.match(/<tr id=["']advanced\.Yrs["'][\s\S]*?<\/tr>/)?.[0];
  if (!totals) throw new Error("Career totals row was not found");

  const table = html.match(/<table[^>]+id=["']advanced["'][\s\S]*?<\/table>/)?.[0] ?? "";
  const seasons = [...table.matchAll(/<tr id=["']advanced\.(\d{4})["'][\s\S]*?<\/tr>/g)].map(
    ([row]): Season => {
      const season = row.match(/data-stat=["']year_id["'][^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/)?.[1];
      if (!season) throw new Error("Season label was not found");
      return {
        season,
        winShares: readStat(row, "ws"),
        games: readOptionalStat(row, "games") ?? undefined,
        winSharesPer48: readOptionalStat(row, "ws_per_48"),
      };
    },
  );
  if (seasons.length === 0) throw new Error("Season history was not found");

  return { games: readStat(totals, "games"), winShares: readStat(totals, "ws"), seasons };
};

const fetchPlayer = async (url: string): Promise<Player> => {
  const response = await fetch(url, {
    headers: { "user-agent": "wembyvshorford/2.0 (+https://wembyvshorford.com)" },
  });
  if (!response.ok) throw new Error(`Basketball Reference returned ${response.status}`);
  return parsePlayer(await response.text());
};

export const scrapeCareerStats = async (): Promise<CareerStats> => {
  const [wemby, horford] = await Promise.all([fetchPlayer(wembyUrl), fetchPlayer(horfordUrl)]);
  return { wemby, horford, updatedAt: new Date().toISOString() };
};

const isCareerStats = (value: unknown): value is CareerStats => {
  const stats = value as CareerStats | null;
  return Boolean(
    stats?.updatedAt &&
      Number.isFinite(stats.wemby?.winShares) &&
      Number.isFinite(stats.horford?.winShares) &&
      stats.wemby.seasons?.length &&
      stats.horford.seasons?.length,
  );
};

export const getCareerStats = async (): Promise<CareerStats> => {
  try {
    const stats = await env.VINEXT_KV_CACHE.get(STATS_KEY, "json");
    return isCareerStats(stats) ? stats : FALLBACK;
  } catch {
    return FALLBACK;
  }
};
