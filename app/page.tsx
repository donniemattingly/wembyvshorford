import React from 'react';
import {fetchData, horfordUrl, wembyUrl} from "@/app/bbref-api";
import TimingBreakdown from '@/components/TimingBreakdown';
import Head from "next/head";

export default async function Home() {
  const data = await fetchData();
  if (data !== null) {
    const { wemby, horford } = data;
    return (
      <>
        <main className="flex min-h-screen flex-col items-center justify-center p-24">
          <div>
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
          <TimingBreakdown pronoun="him" winShares={wemby.winShares} games={wemby.games} target={horford.winShares} />
        </main>
        <footer> Proudly built with Next.js</footer>
      </>
    )
  }
}
