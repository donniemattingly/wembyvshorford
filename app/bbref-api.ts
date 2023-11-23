import { JSDOM } from 'jsdom';
import { strict as assert } from 'assert';


export const horfordUrl = 'https://www.basketball-reference.com/players/h/horfoal01.html';
export const wembyUrl = 'https://www.basketball-reference.com/players/w/wembavi01.html'
const cacheTime = 60 * 5 // 5 min (in seconds)
const fetchParams: RequestInit = { cache: 'no-store', next: { revalidate: cacheTime } };
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
export const fetchData = async () => {

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