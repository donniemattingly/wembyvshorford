"use client";

import { useMemo, useState } from "react";
import { type StoredProjection, label } from "@/lib/model/crossover";
import { useWidth } from "./hooks";

const cumulative = (start: number, values: number[]) => {
  let t = start;
  return [start, ...values.map((v) => (t += v))];
};

/**
 * Every comparable's career after the matching season, scaled to Wembanyama's level and added to his total,
 * against Horford's expected finish.
 */
export default function CompsChart({ stored, seasons }: { stored: StoredProjection; seasons: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { wemby, horford } = stored;
  const n = Math.min(seasons, wemby.paths[0].length);
  const [selected, setSelected] = useState(0);

  const data = useMemo(() => {
    const horfordPath = cumulative(horford.career, Array.from({ length: n }, (_, i) => horford.mean[i] ?? 0));
    const paths = wemby.paths.map((p, i) => {
      const cum = cumulative(wemby.career, p.slice(0, n));
      const cross = cum.findIndex((v, s) => s > 0 && v >= horfordPath[s]);
      return { cum, weight: wemby.weights[i], cross: cross > 0 ? cross : null };
    });
    const passShare = paths.reduce((t, p) => t + (p.cross ? p.weight : 0), 0);
    return { horfordPath, paths, passShare };
  }, [wemby, horford, n]);

  const height = width < 560 ? 320 : 400;
  const m = { top: 20, right: width < 560 ? 14 : 110, bottom: 34, left: 44 };
  const innerW = Math.max(width - m.left - m.right, 10);
  const innerH = height - m.top - m.bottom;
  // Scale to the bulk of the comparables (and whichever one is picked); a rare outlier runs off the top.
  const finals = data.paths.map((p) => p.cum[n]).sort((a, b) => a - b);
  const bulk = finals[Math.floor(finals.length * 0.92)] ?? finals.at(-1)!;
  const listed = data.paths.slice(0, wemby.comps.length).map((p) => p.cum[n]);
  const max = Math.ceil((Math.max(bulk, ...listed, data.horfordPath[n]) * 1.08) / 50) * 50;
  const x = (i: number) => m.left + (i / n) * innerW;
  const y = (v: number) => m.top + innerH - (v / max) * innerH;
  const path = (values: number[]) => values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");
  const maxWeight = Math.max(...wemby.weights);
  const pick = data.paths[selected];
  const comp = wemby.comps[selected];
  const first = wemby.checkpoint + 1;

  return (
    <div className="comps-layout">
      <ol className="comps-list">
        {wemby.comps.map((c, i) => (
          <li key={c.name}>
            <button
              type="button"
              className={i === selected ? "on" : ""}
              onPointerEnter={() => setSelected(i)}
              onFocus={() => setSelected(i)}
              onClick={() => setSelected(i)}
            >
              <span className="name">{c.name}</span>
              <span className="meta">
                {c.season.replace("-", "–")} · age {c.age}
              </span>
              <i>
                <b style={{ width: `${(c.weight / wemby.comps[0].weight) * 100}%` }} />
              </i>
              <em>{Math.round(c.weight * 100)}%</em>
            </button>
          </li>
        ))}
      </ol>
      <div className="comps-chart" ref={ref}>
        <svg width={width} height={height} role="img" aria-label="Wembanyama's career total if he followed each comparable">
          <defs>
            <clipPath id="comps-clip">
              <rect x={0} y={m.top - 4} width={width} height={innerH + 8} />
            </clipPath>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t} className="grid">
              <line x1={m.left} x2={m.left + innerW} y1={y(t * max)} y2={y(t * max)} />
              <text x={m.left - 10} y={y(t * max) + 4} textAnchor="end">
                {Math.round(t * max)}
              </text>
            </g>
          ))}
          {Array.from({ length: n + 1 }, (_, i) =>
            i % (width < 560 ? 5 : 3) === 0 ? (
              <text key={i} className="axis" x={x(i)} y={height - 12} textAnchor="middle">
                {i === 0 ? label(wemby.checkpoint) : label(wemby.checkpoint + i).replace(/^20/, "’")}
              </text>
            ) : null,
          )}
          <g clipPath="url(#comps-clip)">
          {data.paths.map((p, i) => (
            <path
              key={i}
              className="comp-line"
              style={{ opacity: 0.08 + (p.weight / maxWeight) * 0.32 }}
              d={path(p.cum)}
            />
          ))}
          <path className="median-h" d={path(data.horfordPath)} />
          <path key={selected} className="comp-line on" d={path(pick.cum)} />
          </g>
          {pick.cross && <circle className="comp-cross" cx={x(pick.cross)} cy={y(pick.cum[pick.cross])} r={6} />}
          {width >= 560 && (
            <text className="end-label h" x={x(n) + 10} y={y(data.horfordPath[n]) + 4}>
              HORFORD
            </text>
          )}
        </svg>
        <p className="comps-readout" aria-live="polite">
          <strong>{comp.name}</strong> path: Wembanyama finishes with{" "}
          <strong>{Math.round(pick.cum[n])}</strong> career Win Shares
          {pick.cross ? (
            <>
              {" "}
              and passes Horford in <strong>{label(first + pick.cross - 1)}</strong>.
            </>
          ) : (
            <> and never passes Horford.</>
          )}{" "}
          Weighted across all {wemby.paths.length} comparables, {Math.round(data.passShare * 100)}% of paths get there.
        </p>
      </div>
    </div>
  );
}
