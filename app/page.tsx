import Image from 'next/image'

const {JSDOM} = require("jsdom");


const getWinShareFromHtml = (html: string): string => {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    let winSharesTipElement = document.querySelector('span.poptip[data-tip*="Win Shares"]');
    return winSharesTipElement.parentElement.lastChild.innerHTML
}

const horfordUrl = 'https://www.basketball-reference.com/players/h/horfoal01.html';
const wembyUrl = 'https://www.basketball-reference.com/players/w/wembavi01.html'
const fetchData = async () => {

    try {
        // Fetch both URLs in parallel
        const [wembyResponse, horfordResponse] = await Promise.all([
            fetch(wembyUrl),
            fetch(horfordUrl)
        ]);

        // Parse the JSON response
        const wembyHtml = await wembyResponse.text();
        const horfordHtml = await horfordResponse.text();

        const wembyShares = getWinShareFromHtml(wembyHtml);
        const horfordShares = getWinShareFromHtml(horfordHtml)

        return {
            wemby: parseFloat(wembyShares),
            horford: parseFloat(horfordShares)
        }

    } catch (error) {
        console.error('Error fetching data:', error);
    }

    return null;
}

export default async function Home() {
    const data = await fetchData();
    if (data !== null) {
        const {wemby, horford} = data;
        return (
            <>
                <main className="flex min-h-screen flex-col items-center justify-center p-24">
                    <div>
                        Does Victor Wembanyama have more career win shares than Al Horford?
                    </div>
                    <div className='text-9xl font-extrabold pt-24'>
                        {horford > wemby
                            ? <h1> No </h1>
                            : <h1> Yes </h1>
                        }
                    </div>
                    <div
                        className="flex flex-row text-lg w-1/2 justify-between font-normal pt-24 underline text-cyan-400">
                    <span>
                        <a href={horfordUrl}> Horford: {horford} </a>
                    </span>
                        <span>
                        <a href={wembyUrl}> Wembanyama: {wemby} </a>
                    </span>
                    </div>
                </main>
                <footer> Proudly built with Next.js</footer>
            </>
        )
    }
}
