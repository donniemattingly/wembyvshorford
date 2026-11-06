"use client";

import { useState } from "react";
import { label } from "@/lib/model/crossover";
import { useWidth } from "./hooks";
import type { SimulationState } from "./useSimulation";

const pct = (v: number) => (v > 0 && v < 0.005 ? "<1%" : `${Math.round(v * 100)}%`);

/** Share of simulations in which the crossing happens in each season, plus the share where it never does. */
export default function CrossingChart({ state, seasons }: { state: SimulationState; seasons: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const { sim, count } = state;
  const n = Math.min(seasons, sim.horizon);
  // Fold any crossings past the visible window into the last bar so nothing goes missing.
  const shown = state.crossings.slice(0, n);
  shown[n - 1] += state.crossings.slice(n).reduce((a, b) => a + b, 0);
  const bars = [...shown, state.never];
  const share = bars.map((c) => (count ? c / count : 0));
  const max = Math.max(...share.slice(0, n), 0.05);
  const height = width < 560 ? 240 : 280;
  const m = { top: 28, right: 8, bottom: 34, left: 8 };
  const innerW = width - m.left - m.right;
  const innerH = height - m.top - m.bottom;
  const gapBeforeNever = 18;
  const slot = (innerW - gapBeforeNever) / bars.length;
  const barW = Math.max(slot - 3, 2);
  const xAt = (i: number) => m.left + i * slot + (i === bars.length - 1 ? gapBeforeNever : 0);
  const labelEvery = width < 560 ? 3 : 1;
  let running = 0;
  const byEnd = shown.map((c) => (running += c) / (count || 1));

  return (
    <div className="crossing" ref={ref}>
      <svg width={width} height={height} role="img" aria-label="Season in which Wembanyama passes Horford, by share of simulations">
        <line className="base" x1={m.left} x2={width - m.right} y1={m.top + innerH} y2={m.top + innerH} />
        {bars.map((_, i) => {
          const never = i === bars.length - 1;
          // "Never" can be larger than any one season, so it is capped and labeled rather than scaled.
          const h = Math.min(share[i] / max, 1) * innerH;
          const isMedian = state.median === i && !never;
          const cls = never ? "bar never" : isMedian ? "bar median" : "bar";
          return (
            <g
              key={i}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onPointerDown={() => setHover(i)}
            >
              <rect x={xAt(i) - 1} y={m.top} width={slot} height={innerH} fill="transparent" />
              <rect className={cls} x={xAt(i)} y={m.top + innerH - h} width={barW} height={Math.max(h, 0)} rx={2} />
              {never && share[i] / max > 1 && (
                <text className="cap" x={xAt(i) + barW / 2} y={m.top - 8} textAnchor="middle">
                  {pct(share[i])}
                </text>
              )}
              {(never || i % labelEvery === 0) && (
                <text className="axis" x={xAt(i) + barW / 2} y={height - 12} textAnchor="middle">
                  {never ? "NEVER" : label(sim.current + i).slice(2, 4) + "–" + label(sim.current + i).slice(-2)}
                </text>
              )}
              {isMedian && (
                <text className="median-tag" x={xAt(i) + barW / 2} y={m.top + innerH - h - 8} textAnchor="middle">
                  MEDIAN
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="tip" style={{ left: Math.min(Math.max(xAt(hover) + barW / 2, 90), width - 90), top: 0 }}>
          {hover === bars.length - 1 ? (
            <>
              <b>Never passes him</b>
              <span>{pct(share[hover])} of simulated careers</span>
            </>
          ) : (
            <>
              <b>{label(sim.current + hover)}</b>
              <span>{pct(share[hover])} cross this season</span>
              <span>{pct(byEnd[hover])} have crossed by its end</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
