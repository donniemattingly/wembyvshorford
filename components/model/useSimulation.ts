"use client";

import { useEffect, useState } from "react";
import { type Scenario, type Simulation, type StoredProjection, createSimulation, quantile } from "@/lib/model/crossover";
import type { Player } from "@/lib/stats.server";
import { prefersReducedMotion } from "./hooks";

export const TOTAL_SIMS = 4000;
const BATCH = 160;
const TRACES = 48;

export type Band = { p10: number; p25: number; p50: number; p75: number; p90: number };

export type SimulationState = {
  sim: Simulation;
  /** Simulations finished so far. */
  count: number;
  done: boolean;
  /** Cumulative career Win Shares by season, for each player. Index 0 is the end of the current season. */
  wemby: Band[];
  horford: Band[];
  /** Crossing counts by season index, and the count that never cross. */
  crossings: number[];
  never: number;
  /** A handful of individual runs, newest last, to draw as traces. */
  traces: { wemby: number[]; horford: number[]; crossed: number }[];
  /** Season indexes (into crossings) of the 10th, 50th and 90th percentile crossing, among runs that cross. */
  low: number | null;
  median: number | null;
  high: number | null;
};

const bands = (columns: number[][]): Band[] =>
  columns.map((values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      p10: quantile(sorted, 0.1),
      p25: quantile(sorted, 0.25),
      p50: quantile(sorted, 0.5),
      p75: quantile(sorted, 0.75),
      p90: quantile(sorted, 0.9),
    };
  });

const crossingIndex = (crossings: number[], passed: number, q: number) => {
  if (!passed) return null;
  const target = Math.floor((passed - 1) * q);
  let seen = 0;
  for (let i = 0; i < crossings.length; i++) {
    seen += crossings[i];
    if (seen > target) return i;
  }
  return crossings.length - 1;
};

/** Runs the 4,000 simulations a batch per frame so the charts fill in as they go. */
export const useSimulation = (
  stored: StoredProjection,
  wemby: Player,
  horford: Player,
  asOf: string,
  scenario: { wemby: Scenario; horford: Scenario },
  runKey: number,
): SimulationState | null => {
  const [state, setState] = useState<SimulationState | null>(null);
  const key = JSON.stringify(scenario);

  useEffect(() => {
    const sim = createSimulation(stored, wemby, horford, new Date(asOf), scenario);
    const wCols: number[][] = Array.from({ length: sim.horizon }, () => []);
    const hCols: number[][] = Array.from({ length: sim.horizon }, () => []);
    const crossings = new Array<number>(sim.horizon).fill(0);
    let never = 0;
    let traces: SimulationState["traces"] = [];
    let count = 0;
    let frame = 0;
    const instant = prefersReducedMotion();

    const step = () => {
      const n = instant ? TOTAL_SIMS : BATCH;
      const runs = sim.run(Math.min(n, TOTAL_SIMS - count));
      for (const r of runs) {
        for (let s = 0; s < sim.horizon; s++) {
          wCols[s].push(r.wemby[s]);
          hCols[s].push(r.horford[s]);
        }
        if (Number.isFinite(r.crossed)) crossings[Math.max(r.crossed - sim.current, 0)]++;
        else never++;
      }
      count += runs.length;
      traces = [...traces, ...runs.slice(0, 3)].slice(-TRACES);
      const passed = count - never;
      setState({
        sim,
        count,
        done: count >= TOTAL_SIMS,
        wemby: bands(wCols),
        horford: bands(hCols),
        crossings: [...crossings],
        never,
        traces,
        low: crossingIndex(crossings, passed, 0.1),
        median: crossingIndex(crossings, passed, 0.5),
        high: crossingIndex(crossings, passed, 0.9),
      });
      if (count < TOTAL_SIMS) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored, wemby, horford, asOf, key, runKey]);

  return state;
};
