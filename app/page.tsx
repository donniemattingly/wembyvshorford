import React from 'react';
import {fetchData, horfordUrl, wembyUrl} from "@/app/bbref-api.server";
import TimingBreakdown from '@/components/TimingBreakdown';
import SeasonProgress from '@/components/SeasonProgress';

// No time-based revalidation - page is regenerated via daily cron job
export const revalidate = false;

export default async function Home() {
  const data = await fetchData();
  if (data !== null) {
    const { season, wemby, horford } = data;
    const updated = new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
    });
    return (
      <>
        <main className="flex min-h-screen flex-col items-center justify-center p-8 md:p-24">
          <div className='text-center'>
            Does Victor Wembanyama have more career win shares than Al Horford?
          </div>
          <div className='text-9xl font-extrabold pt-24'>
            {horford.winShares > wemby.winShares
              ? <h1> No </h1>
              : <h1> Yes </h1>
            }
          </div>
          <div
            className="flex flex-row text-lg md:w-1/2 w-[18rem] justify-between font-normal pt-24 underline text-cyan-400">
            <span>
              <a href={horfordUrl}> Horford: {horford.winShares} </a>
            </span>
            <span>
              <a href={wembyUrl}> Wembanyama: {wemby.winShares} </a>
            </span>
          </div>
          <SeasonProgress season={season} wemby={wemby} horford={horford} />
          <TimingBreakdown
            winShares={wemby.winShares}
            games={wemby.games}
            target={horford.winShares}
            seasonWinShares={wemby.season?.winShares}
            seasonGames={wemby.season?.games}
          />
        </main>
        <footer className='pb-4 text-center text-sm text-neutral-500'>
          Stats from Basketball Reference. Updated {updated}.
        </footer>
      </>
    )
  }
}
