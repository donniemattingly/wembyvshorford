import 'server-only';
import { JSDOM } from 'jsdom';
import { strict as assert } from 'assert';

export const horfordUrl = 'https://www.basketball-reference.com/players/h/horfoal01.html';
export const wembyUrl = 'https://www.basketball-reference.com/players/w/wembavi01.html'

// Don't cache fetches - page-level caching handles revalidation via daily cron job
const fetchParams: RequestInit = {
    cache: 'no-store'
};

type PopTip = 'Win Shares' | 'Games';

export type SeasonStats = {
    games: number;
    winShares: number;
    winSharesPer48: number | null;
};

export type PlayerData = {
    winShares: number;
    games: number;
    // Null when the player has no row for the current season yet, or the table couldn't be parsed
    season: SeasonStats | null;
};

// NBA seasons start in October, so Oct-Dec belong to the season that ends next year.
export const currentSeasonLabel = (date: Date = new Date()): string => {
    const year = date.getUTCFullYear();
    const startYear = date.getUTCMonth() >= 9 ? year : year - 1;
    const endYear = (startYear + 1) % 100;
    return `${startYear}-${endYear.toString().padStart(2, '0')}`;
}

const readPopTip = (document: Document, dataTip: PopTip, exact: boolean): number => {
    const query = `span.poptip[data-tip${exact ? '' : '*' }="${dataTip}"]`;
    const element = document.querySelector(query);
    const value = element?.parentElement?.lastChild?.textContent;
    assert(value != null, `Couldn't find ${dataTip}`);
    return parseFloat(value);
}

const cellNumber = (row: Element, stats: string[]): number | null => {
    for (const stat of stats) {
        const text = row.querySelector(`[data-stat="${stat}"]`)?.textContent?.trim();
        if (text) {
            const value = parseFloat(text);
            if (!Number.isNaN(value)) {
                return value;
            }
        }
    }
    return null;
}

const findAdvancedTable = (document: Document): Element | null =>
    document.querySelector('table#advanced, table#advanced_stats');

// Reads this season's line from the advanced stats table. Basketball Reference sometimes
// ships secondary tables inside HTML comments, so fall back to un-commenting the page.
const readSeason = (html: string, document: Document, season: string): SeasonStats | null => {
    let table = findAdvancedTable(document);
    if (table == null) {
        const uncommented = new JSDOM(html.replace(/<!--|-->/g, '')).window.document;
        table = findAdvancedTable(uncommented);
    }
    if (table == null) {
        console.warn('Advanced stats table not found');
        return null;
    }

    // A traded player has a combined row (e.g. "2TM") first, followed by per-team rows,
    // so the first row matching the season is the one we want.
    const row = Array.from(table.querySelectorAll('tbody tr')).find(tr => {
        const label = tr.querySelector('[data-stat="year_id"], [data-stat="season"]')?.textContent?.trim();
        return label === season;
    });
    if (row == null) {
        return null;
    }

    const games = cellNumber(row, ['games', 'g']);
    const winShares = cellNumber(row, ['ws']);
    if (games == null || winShares == null) {
        return null;
    }
    return {
        games,
        winShares,
        winSharesPer48: cellNumber(row, ['ws_per_48']),
    };
}

const getDataFromHtml = (html: string, season: string): PlayerData => {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    let seasonStats: SeasonStats | null = null;
    try {
        seasonStats = readSeason(html, document, season);
    } catch (error) {
        console.error('Error reading season stats:', error);
    }

    return {
        winShares: readPopTip(document, 'Win Shares', false),
        games: readPopTip(document, 'Games', true),
        season: seasonStats,
    };
}

export const fetchData = async () => {
    try {
        // Fetch both URLs in parallel
        const [wembyResponse, horfordResponse] = await Promise.all([
            fetch(wembyUrl, fetchParams),
            fetch(horfordUrl, fetchParams)
        ]);

        const wembyHtml = await wembyResponse.text();
        const horfordHtml = await horfordResponse.text();

        const season = currentSeasonLabel();
        const wemby = getDataFromHtml(wembyHtml, season);
        const horford = getDataFromHtml(horfordHtml, season);

        return {
            season,
            wemby,
            horford,
        };

    } catch (error) {
        console.error('Error fetching data:', error);
    }

    return null;
}
