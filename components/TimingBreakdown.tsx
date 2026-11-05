import React from 'react';

const gamesPerSeason = 82 as const;

export type TimingBreakdownPropTypes = {
  winShares: number;
  games: number;
  target: number;
  seasonWinShares?: number;
  seasonGames?: number;
}

const formatGames = (games: number) =>
  games.toLocaleString(undefined, { maximumFractionDigits: 0 });

const formatSeasons = (games: number) =>
  (games / gamesPerSeason).toLocaleString(undefined, { maximumFractionDigits: 1 });

// Games needed to close the gap at a given win shares per game rate, or null if the rate never gets there
const gamesToCatch = (gap: number, rate: number): number | null =>
  rate > 0 ? gap / rate : null;

function TimingBreakdown({ winShares, games, target, seasonWinShares, seasonGames }: TimingBreakdownPropTypes) {
  if (winShares > target || games <= 0) {
    return null;
  }
  const gap = target - winShares;
  const careerGames = gamesToCatch(gap, winShares / games);
  const seasonPaceGames = seasonGames && seasonWinShares != null
    ? gamesToCatch(gap, seasonWinShares / seasonGames)
    : null;

  return (
    <div className='py-4 text-center text-neutral-300 space-y-1'>
      {careerGames != null && (
        <p>
          At his career pace: {formatGames(careerGames)} more games
          (about {formatSeasons(careerGames)} full seasons).
        </p>
      )}
      {seasonPaceGames != null && (
        <p>
          At this season&apos;s pace: {formatGames(seasonPaceGames)} more games
          (about {formatSeasons(seasonPaceGames)} full seasons).
        </p>
      )}
    </div>
  )
}

export default TimingBreakdown;
