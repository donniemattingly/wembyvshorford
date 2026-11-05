import React from 'react';
import type { PlayerData } from '@/app/bbref-api.server';

export type SeasonProgressPropTypes = {
  season: string;
  wemby: PlayerData;
  horford: PlayerData;
}

const formatWs = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const formatWs48 = (value: number | null | undefined) =>
  value == null ? '—' : value.toFixed(3).replace(/^0/, '');

const formatSigned = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatWs(Math.abs(value))}`;

function Row({ name, player }: { name: string, player: PlayerData }) {
  return (
    <tr className='border-t border-neutral-700'>
      <th scope='row' className='py-2 pr-6 text-left font-normal'>{name}</th>
      <td className='py-2 px-3 text-right tabular-nums'>{player.season?.games ?? '—'}</td>
      <td className='py-2 px-3 text-right tabular-nums'>{player.season ? formatWs(player.season.winShares) : '—'}</td>
      <td className='py-2 pl-3 text-right tabular-nums'>{formatWs48(player.season?.winSharesPer48)}</td>
    </tr>
  );
}

function SeasonProgress({ season, wemby, horford }: SeasonProgressPropTypes) {
  if (wemby.season == null && horford.season == null) {
    return null;
  }

  const gapNow = horford.winShares - wemby.winShares;
  const gapClosed = (wemby.season?.winShares ?? 0) - (horford.season?.winShares ?? 0);
  const gapAtStart = gapNow + gapClosed;

  return (
    <section className='pt-16 w-full max-w-md'>
      <h2 className='text-sm uppercase tracking-wider text-neutral-400 pb-2'>{season} season</h2>
      <table className='w-full text-lg'>
        <thead>
          <tr className='text-sm text-neutral-400'>
            <th scope='col' className='pb-1 text-left font-normal'>Player</th>
            <th scope='col' className='pb-1 px-3 text-right font-normal'>GP</th>
            <th scope='col' className='pb-1 px-3 text-right font-normal'>WS</th>
            <th scope='col' className='pb-1 pl-3 text-right font-normal'>WS/48</th>
          </tr>
        </thead>
        <tbody>
          <Row name='Wembanyama' player={wemby} />
          <Row name='Horford' player={horford} />
        </tbody>
      </table>
      {gapNow > 0 && (
        <p className='pt-4 text-neutral-300'>
          Gap: {formatWs(gapNow)} win shares, {gapClosed >= 0 ? 'down' : 'up'} from {formatWs(gapAtStart)} at
          the start of the season ({formatSigned(-gapClosed)}).
        </p>
      )}
    </section>
  );
}

export default SeasonProgress;
