// Every season's stat breakdown for both players: finished seasons from seasons.json, and the season in progress
// from the daily scrape when it is newer.
import { type Attribution, type Box, type TeamContext, attribute, calibrate } from "@/lib/breakdown/engine";
import type { GameLine, LiveBreakdown } from "@/lib/breakdown/live.server";
import seasonsData from "@/lib/breakdown/seasons.json";

export type PlayerKey = "wemby" | "horford";

/** One player's season (or one team's stint in it) and its Win Shares split by stat. */
export type SeasonBreakdown = { season: string; team: string; games: number; attribution: Attribution };

type StoredSeason = { season: string; team: string; games: number; box: Box; context: string; attribution: Attribution };
type Stored = { latestSeason: string; players: Record<PlayerKey, StoredSeason[]>; contexts: Record<string, TeamContext> };

const stored = seasonsData as unknown as Stored;

export const breakdownSeasons = (live: LiveBreakdown | null): Record<PlayerKey, SeasonBreakdown[]> => {
  const out = {} as Record<PlayerKey, SeasonBreakdown[]>;
  for (const name of ["wemby", "horford"] as const) {
    const seasons: SeasonBreakdown[] = stored.players[name].map(({ season, team, games, attribution }) => ({
      season,
      team,
      games,
      attribution,
    }));
    const current = live?.players[name];
    const context = current && live.contexts[current.context];
    if (current && context) {
      const same = seasons.filter((s) => s.season === current.season);
      const storedGames = same.reduce((t, s) => t + s.games, 0);
      if (current.games >= storedGames) {
        const { season, team, games, box, target } = current;
        const raw = attribute(box, context, games);
        const fresh = { season, team, games, attribution: target ? calibrate(raw, target) : raw };
        const at = seasons.findIndex((s) => s.season === current.season);
        const rest = seasons.filter((s) => s.season !== current.season);
        if (at === -1) rest.push(fresh);
        else rest.splice(at, 0, fresh);
        out[name] = rest;
        continue;
      }
    }
    out[name] = seasons;
  }
  return out;
};

/** This season's games for each player, with the team totals to measure them against. */
export type GameLog = { games: GameLine[]; context: TeamContext };

export const breakdownGames = (live: LiveBreakdown | null): Partial<Record<PlayerKey, GameLog>> => {
  const out: Partial<Record<PlayerKey, GameLog>> = {};
  for (const name of ["wemby", "horford"] as const) {
    const games = live?.games?.[name];
    const line = live?.players[name];
    const context = line && live.contexts[line.context];
    if (games?.length && context) out[name] = { games, context };
  }
  return out;
};
