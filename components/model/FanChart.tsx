"use client";

import { useState } from "react";
import { label } from "@/lib/model/crossover";
import { useWidth } from "./hooks";
import type { Band, SimulationState } from "./useSimulation";

const f1 = (v: number) => v.toFixed(1);

const tickStep = (v: number) => (v > 300 ? 100 : v > 120 ? 50 : 25);
const niceMax = (v: number) => Math.ceil(v / tickStep(v)) * tickStep(v);

const area = (band: Band[], lo: keyof Band, hi: keyof Band, x: (i: number) => number, y: (v: number) => number) => {
  if (!band.length) return "";
  const top = band.map((b, i) => `${x(i)},${y(b[hi])}`);
  const bottom = band.map((b, i) => `${x(i)},${y(b[lo])}`).reverse();
  return `M${top.join("L")}L${bottom.join("L")}Z`;
};

const line = (values: number[], x: (i: number) => number, y: (v: number) => number) =>
  values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");

/** Cumulative career Win Shares across all simulations: 80% and 50% bands, medians, and a few raw runs. */
export default function FanChart({ state, seasons }: { state: SimulationState; seasons: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const { sim } = state;
  const n = Math.min(seasons, sim.horizon);
  const height = width < 560 ? 340 : 440;
  const m = { top: 24, right: width < 560 ? 16 : 120, bottom: 36, left: 44 };
  const innerW = Math.max(width - m.left - m.right, 10);
  const innerH = height - m.top - m.bottom;

  // Point 0 is today; point i (1..n) is the end of season i - 1.
  const pad = (start: number, band: Band[]) => [
    { p10: start, p25: start, p50: start, p75: start, p90: start },
    ...band.slice(0, n),
  ];
  const wemby = pad(sim.wembyNow, state.wemby);
  const horford = pad(sim.horfordNow, state.horford);
  const max = niceMax(Math.max(...wemby.map((b) => b.p90), ...horford.map((b) => b.p90)) * 1.04);
  const x = (i: number) => m.left + (i / n) * innerW;
  const y = (v: number) => m.top + innerH - (v / max) * innerH;
  const step = tickStep(max);
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const labelEvery = width < 560 ? 4 : 2;

  // Where the median careers meet.
  let meet: { i: number; v: number } | null = null;
  for (let i = 1; i < wemby.length; i++) {
    const a = wemby[i - 1].p50 - horford[i - 1].p50;
    const b = wemby[i].p50 - horford[i].p50;
    if (a < 0 && b >= 0) {
      const t = a / (a - b);
      meet = { i: i - 1 + t, v: wemby[i - 1].p50 + (wemby[i].p50 - wemby[i - 1].p50) * t };
      break;
    }
  }

  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const i = Math.round(((event.clientX - box.left) / box.width) * n);
    setHover(Math.min(Math.max(i, 0), n));
  };

  const hb = hover == null ? null : { w: wemby[hover], h: horford[hover] };
  const seasonAt = (i: number) => (i === 0 ? "Today" : `End of ${label(sim.current + i - 1)}`);

  return (
    <div className="fan" ref={ref}>
      <div className="chart-key">
        <span>
          <i className="w" /> WEMBANYAMA
        </span>
        <span>
          <i className="h" /> HORFORD
        </span>
        <span>
          <i className="band" /> MIDDLE 50% AND 80% OF RUNS
        </span>
        {meet && (
          <span>
            <i className="dot" /> MEDIAN CAREERS MEET
          </span>
        )}
      </div>
      <div className="plot">
      <svg width={width} height={height} role="img" aria-label="Simulated career Win Shares by season">
        <defs>
          <clipPath id="fan-reveal">
            <rect className="fan-reveal" x={0} y={0} width={width} height={height} />
          </clipPath>
        </defs>
        {ticks.map((t) => (
          <g key={t} className="grid">
            <line x1={m.left} x2={m.left + innerW} y1={y(t)} y2={y(t)} />
            <text x={m.left - 10} y={y(t) + 4} textAnchor="end">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {wemby.map((_, i) =>
          i % labelEvery === 0 && i > 0 ? (
            <text key={i} className="axis" x={x(i)} y={height - 12} textAnchor="middle">
              {label(sim.current + i - 1).replace(/^20/, "’")}
            </text>
          ) : null,
        )}
        <text className="axis" x={x(0)} y={height - 12} textAnchor="start">
          NOW
        </text>

        <g clipPath="url(#fan-reveal)">
          <path className="band-h outer" d={area(horford, "p10", "p90", x, y)} />
          <path className="band-w outer" d={area(wemby, "p10", "p90", x, y)} />
          <path className="band-w inner" d={area(wemby, "p25", "p75", x, y)} />
          {state.traces.map((t, k) => (
            <path
              key={k}
              className="trace"
              style={{ opacity: state.done ? 0.07 : 0.05 + (k / state.traces.length) * 0.3 }}
              d={line([sim.wembyNow, ...t.wemby.slice(0, n)], x, y)}
            />
          ))}
          <path className="median-h" d={line(horford.map((b) => b.p50), x, y)} />
          <path className="median-w" d={line(wemby.map((b) => b.p50), x, y)} />
        </g>

        {meet && (
          <g className="meet" transform={`translate(${x(meet.i)},${y(meet.v)})`}>
            <circle r={13} className="halo" />
            <circle r={5} />
          </g>
        )}

        {width >= 560 && (
          <>
            <text className="end-label w" x={x(n) + 10} y={y(wemby[n].p50) + 4}>
              WEMBY {Math.round(wemby[n].p50)}
            </text>
            <text className="end-label h" x={x(n) + 10} y={y(horford[n].p50) + (horford[n].p50 > wemby[n].p50 ? -4 : 14)}>
              HORFORD {Math.round(horford[n].p50)}
            </text>
          </>
        )}

        {hover != null && (
          <g className="crosshair">
            <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + innerH} />
            <circle cx={x(hover)} cy={y(wemby[hover].p50)} r={5} className="w" />
            <circle cx={x(hover)} cy={y(horford[hover].p50)} r={5} className="h" />
          </g>
        )}
        <rect
          x={m.left}
          y={m.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover != null && hb && (
        <div
          className="tip"
          style={{
            left: Math.min(Math.max(x(hover), 90), width - 90),
            top: Math.max(y(Math.max(hb.w.p90, hb.h.p50)) - 12, 0),
          }}
        >
          <b>{seasonAt(hover)}</b>
          <span>
            <i className="w" /> Wemby {f1(hb.w.p50)}
            {hover > 0 && (
              <small>
                {" "}
                80%: {f1(hb.w.p10)}–{f1(hb.w.p90)}
              </small>
            )}
          </span>
          <span>
            <i className="h" /> Horford {f1(hb.h.p50)}
          </span>
        </div>
      )}
      </div>
    </div>
  );
}
