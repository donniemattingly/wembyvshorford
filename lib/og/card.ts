// The 1200x630 share card, drawn from the live numbers. Rendered to PNG by lib/og/render.ts.

export type CardNumbers = { wemby: number; horford: number };

const one = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Changes whenever a number on the card changes, so link previews (Discord, Slack, iMessage) that
// cache by URL fetch a fresh image.
export const cardVersion = ({ wemby, horford }: CardNumbers) => `${one(wemby)}-${one(horford)}`.replace(/,/g, "");

export const cardPath = (numbers: CardNumbers) => `/og.png?v=${cardVersion(numbers)}`;

const SANS = "Archivo Black";
const DISPLAY = "Anton";
const INK = "#0a0a09";
const PAPER = "#f1eee5";
const VOLT = "#d7ff2f";
const RED = "#f24b35";

export const cardSvg = ({ wemby, horford }: CardNumbers): string => {
  const caught = wemby >= horford;
  const gap = Math.abs(horford - wemby);
  const share = Math.min(wemby / horford, 1);
  const barWidth = Math.max(Math.round(350 * share), 4);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${INK}"/>
  <circle cx="1030" cy="160" r="260" fill="none" stroke="${PAPER}" stroke-opacity=".08" stroke-width="70"/>
  <rect x="58" y="52" width="44" height="44" fill="${VOLT}"/>
  <text x="80" y="80" fill="${INK}" font-family="${SANS}" font-size="15" text-anchor="middle">WS</text>
  <text x="118" y="82" fill="${PAPER}" font-family="${SANS}" font-size="20" letter-spacing="1">THE WIN SHARE INDEX</text>
  <text x="1142" y="82" fill="${PAPER}" font-family="${SANS}" font-size="14" text-anchor="end" letter-spacing="3">CAREER LEDGER · NBA</text>
  <text x="60" y="185" fill="${VOLT}" font-family="${SANS}" font-size="18" letter-spacing="3">HAS VICTOR WEMBANYAMA CAUGHT AL HORFORD?</text>
  <text x="56" y="340" fill="${PAPER}" font-family="${DISPLAY}" font-size="160">${caught ? "YES." : "NOT YET."}</text>
  <g transform="translate(895 210) rotate(-4)">
    <rect width="245" height="105" fill="${caught ? VOLT : RED}" stroke="${PAPER}" stroke-width="3"/>
    <text x="122" y="52" fill="${INK}" font-family="${DISPLAY}" font-size="40" text-anchor="middle">${one(gap)}</text>
    <text x="122" y="82" fill="${INK}" font-family="${SANS}" font-size="13" letter-spacing="2" text-anchor="middle">${caught ? "WIN SHARES AHEAD" : "WIN SHARES TO GO"}</text>
  </g>
  <line x1="60" x2="1140" y1="408" y2="408" stroke="${PAPER}" stroke-width="3"/>
  <text x="60" y="458" fill="${PAPER}" font-family="${SANS}" font-size="18" letter-spacing="2">WEMBANYAMA</text>
  <text x="60" y="560" fill="${VOLT}" font-family="${DISPLAY}" font-size="100">${one(wemby)}</text>
  <text x="420" y="458" fill="${PAPER}" font-family="${SANS}" font-size="18" letter-spacing="2">HORFORD</text>
  <text x="420" y="560" fill="${PAPER}" font-family="${DISPLAY}" font-size="100">${one(horford)}</text>
  <rect x="790" y="472" width="350" height="24" fill="${PAPER}"/>
  <rect x="790" y="472" width="${barWidth}" height="24" fill="${RED}"/>
  <text x="1140" y="535" fill="${PAPER}" font-family="${SANS}" font-size="14" letter-spacing="2" text-anchor="end">CAREER WIN SHARES · UPDATED DAILY</text>
</svg>`;
};
