import React from 'react';

import { JSDOM } from 'jsdom';
import { strict as assert } from 'assert';
import TimingBreakdown from '@/components/TimingBreakdown';


const horfordUrl = 'https://www.basketball-reference.com/players/h/horfoal01.html';
const wembyUrl = 'https://www.basketball-reference.com/players/w/wembavi01.html'
const cacheTime = 60 * 60 * 8 // 8 hours (in seconds)
const fetchParams = { next: { revalidate: cacheTime } };
type PopTip = 'Win Shares' | 'Games';

const readPopTip = (document: Document, dataTip: PopTip, exact: boolean): number => {
  const query = `span.poptip[data-tip${exact ? '' : '*' }="${dataTip}"]`;
  const element = document.querySelector(query);
  const value = element?.parentElement?.lastChild?.textContent;
  assert(value != null, `Couldn't find ${dataTip}`);
  return parseFloat(value);
}

const getDataFromHtml = (html: string) => {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const data = {
    winShares: readPopTip(document, 'Win Shares', false),
    games: readPopTip(document, 'Games', true),
  };
  return data;
}
const fetchData = async () => {

  try {
    // Fetch both URLs in parallel
    const [wembyResponse, horfordResponse] = await Promise.all([
      fetch(wembyUrl, fetchParams),
      fetch(horfordUrl, fetchParams)
    ]);

    // Parse the JSON response
    const wembyHtml = await wembyResponse.text();
    const horfordHtml = await horfordResponse.text();

    const wemby = getDataFromHtml(wembyHtml);
    const horford = getDataFromHtml(horfordHtml)

    return {
      wemby,
      horford,
    };

  } catch (error) {
    console.error('Error fetching data:', error);
  }

  return null;
}

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
