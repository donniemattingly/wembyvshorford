import React from 'react';

const gamesPerSeason = 82 as const;

export type TimingBreakdownPropTypes = {
  pronoun: string;
  winShares: number;
  games: number;
  target: number;
}

function TimingBreakdown({ pronoun, winShares, games, target}: TimingBreakdownPropTypes) {
  if(winShares > target) {
    return null;
  }
  const rate = winShares/games;
  const remainingGames = winShares >= 0 ? (target - winShares) / rate : Number.POSITIVE_INFINITY;
  const remainingGamesString = remainingGames.toLocaleString(undefined, {maximumFractionDigits: 0 });
  const remainingSeasons = winShares >= 0 ? remainingGames / gamesPerSeason : Number.POSITIVE_INFINITY;
  const remainingSeasonsString = remainingSeasons.toLocaleString(undefined, { maximumFractionDigits: 1 });
  
  return (
    <p className='py-4'>
      At this rate it will take {pronoun} {remainingGamesString} more games
      or {remainingSeasonsString} complete seasons (Assuming he plays
      all {gamesPerSeason} games).
    </p>
  )
}

export default TimingBreakdown;