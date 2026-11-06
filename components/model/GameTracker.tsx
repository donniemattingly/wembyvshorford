"use client";

import { useState } from "react";
import type { TrackEntry } from "@/lib/model/tracker";
import { useWidth } from "./hooks";

const pct = (v: number) => `${Math.round(v * 100)}%`;
const f1 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = (v: number, digits = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`;
// Stats are pulled the morning after a game, so the game was the evening before.
const day = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }).format(
    new Date(new Date(iso).getTime() - 12 * 3_600_000),
  );

/** The model's chance that Wembanyama passes Horford, after each game this season. */
export default function GameTracker({ n, track }: { n: string; track: TrackEntry[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (track.length === 0) return null;

  const height = width < 560 ? 220 : 260;
  const m = { top: 24, right: 16, bottom: 32, left: 40 };
  const innerW = width - m.left - m.right;
  const innerH = height - m.top - m.bottom;
  const lastGame = track.at(-1)!.wemby.games;
  const maxGame = Math.max(10, Math.ceil((lastGame + 2) / 5) * 5);
  const chances = track.map((t) => t.chance);
  const lo = Math.max(0, Math.floor((Math.min(...chances) - 0.05) * 10) / 10);
  const hi = Math.min(1, Math.ceil((Math.max(...chances) + 0.05) * 10) / 10);
  const x = (g: number) => m.left + (g / maxGame) * innerW;
  const y = (c: number) => m.top + (1 - (c - lo) / (hi - lo)) * innerH;
  const ticks = Array.from({ length: Math.round((hi - lo) * 10) + 1 }, (_, i) => lo + i * 0.1);
  const path = track.map((t, i) => `${i ? "L" : "M"}${x(t.wemby.games)},${y(t.chance)}`).join(" ");
  const rows = track.map((t, i) => ({ t, prev: i > 0 ? track[i - 1] : null })).reverse();
  const first = track[0];
  const latest = track.at(-1)!;

  return (
    <section className="lab-section shell">
      <div className="section-label inverse">
        <span>{n}</span>
        <h2>GAME BY GAME</h2>
        <p>THE MODEL AFTER EACH GAME THIS SEASON</p>
      </div>
      <p className="lab-lede">
        Each morning after a game, the model reruns on the new totals. One big night counts twice: once for the Win
        Shares it adds and again as evidence that he is better than projected, which carries into every later season.
        {track.length > 1 && (
          <>
            {" "}
            Since {first.wemby.games ? `game ${first.wemby.games}` : "the opener"}, his chance of passing Horford has moved from {pct(first.chance)} to{" "}
            {pct(latest.chance)}.
          </>
        )}
      </p>
      <div className="tracker" ref={ref}>
        <svg width={width} height={height} role="img" aria-label="Chance he passes Horford after each game">
          <g className="grid">
            {ticks.map((c) => (
              <g key={c}>
                <line x1={m.left} x2={width - m.right} y1={y(c)} y2={y(c)} />
                <text x={m.left - 8} y={y(c) + 4} textAnchor="end">
                  {pct(c)}
                </text>
              </g>
            ))}
          </g>
          {lo < 0.5 && hi > 0.5 && <line className="even" x1={m.left} x2={width - m.right} y1={y(0.5)} y2={y(0.5)} />}
          <path className="line" d={path} />
          {track.map((t, i) => (
            <g
              key={t.date}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onPointerDown={() => setHover(i)}
            >
              <circle className="hit" cx={x(t.wemby.games)} cy={y(t.chance)} r={14} />
              <circle className={i === track.length - 1 ? "dot last" : "dot"} cx={x(t.wemby.games)} cy={y(t.chance)} r={5} />
            </g>
          ))}
          {[0, Math.round(maxGame / 2), maxGame].map((g) => (
            <text
              key={g}
              className="axis"
              x={x(g)}
              y={height - 10}
              textAnchor={g === 0 ? "start" : g === maxGame ? "end" : "middle"}
            >
              {g === 0 ? "OPENER" : `GAME ${g}`}
            </text>
          ))}
        </svg>
        {hover != null && (
          <div
            className="tip"
            style={{ left: Math.min(Math.max(x(track[hover].wemby.games), 90), width - 90), top: y(track[hover].chance) - 12 }}
          >
            <b>{track[hover].wemby.games ? `AFTER GAME ${track[hover].wemby.games}` : "BEFORE THE OPENER"}</b>
            <span>{pct(track[hover].chance)} chance he passes Horford</span>
            <span>{f1(track[hover].wemby.winShares)} Win Shares this season</span>
            <small>{day(track[hover].date)}</small>
          </div>
        )}
      </div>
      <table className="backtest tracker-table">
        <thead>
          <tr>
            <th scope="col">GAME NIGHT</th>
            <th scope="col">GAMES</th>
            <th scope="col">SEASON WS</th>
            <th scope="col">CHANCE</th>
            <th scope="col" className="wide">
              PROJECTED SEASON
            </th>
            <th scope="col" className="wide">
              MEDIAN CROSSOVER
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ t, prev }) => (
            <tr key={t.date}>
              <th scope="row">
                {t.wemby.games ? day(t.date).toUpperCase() : "OPENER"}
                {prev && prev.wemby.games + 1 < t.wemby.games && (
                  <small>{t.wemby.games - prev.wemby.games} games since the last entry</small>
                )}
              </th>
              <td>{t.wemby.games}</td>
              <td>
                {f1(t.wemby.winShares)}
                {prev && <small>{signed(t.wemby.winShares - prev.wemby.winShares)}</small>}
              </td>
              <td>
                {pct(t.chance)}
                {prev && <small>{signed((t.chance - prev.chance) * 100, 0)} pts</small>}
              </td>
              <td className="wide">{f1(t.seasonTotal)}</td>
              <td className="wide">{t.median ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="lab-note">
        Logged each morning from Basketball Reference totals, with the model rerun at 4,000 simulations. Basketball Reference does not publish Win Shares for
        single games, so the change in season Win Shares stands in for each game.
      </p>
    </section>
  );
}
