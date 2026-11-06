"use client";

import { useState } from "react";
import { type StoredProjection, label } from "@/lib/model/crossover";
import type { Player } from "@/lib/stats.server";
import CompsChart from "./CompsChart";
import CrossingChart from "./CrossingChart";
import FanChart from "./FanChart";
import { useReveal, useTween } from "./hooks";
import { TOTAL_SIMS, useSimulation } from "./useSimulation";

const SEASONS = 18;
const f1 = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f3 = (v: number) => v.toFixed(3).replace(/^0/, "");
const int = (v: number) => Math.round(v).toLocaleString("en-US");

function Reveal({ className = "", children }: { className?: string; children: React.ReactNode }) {
  const [ref, inView] = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`reveal ${inView ? "is-in" : ""} ${className}`}>
      {children}
    </div>
  );
}

function Tween({ value, format }: { value: number; format: (v: number) => string }) {
  return <>{format(useTween(value))}</>;
}

function SectionHead({ n, title, sub }: { n: string; title: string; sub: string }) {
  return (
    <div className="section-label inverse">
      <span>{n}</span>
      <h2>{title}</h2>
      <p>{sub}</p>
    </div>
  );
}

type Defaults = { scale: number; noise: number; retire: "model" | number };

export default function ModelLab({
  stored,
  wemby,
  horford,
  asOf,
}: {
  stored: StoredProjection;
  wemby: Player;
  horford: Player;
  asOf: string;
}) {
  const defaults: Defaults = { scale: 1, noise: stored.params.noise, retire: "model" };
  const [scale, setScale] = useState(defaults.scale);
  const [noise, setNoise] = useState(defaults.noise);
  const [retire, setRetire] = useState<Defaults["retire"]>(defaults.retire);
  const [runKey, setRunKey] = useState(0);
  const scenario = {
    wemby: { scale, noise },
    horford: { noise, retireAfter: retire === "model" ? null : retire },
  };
  const state = useSimulation(stored, wemby, horford, asOf, scenario, runKey);
  const changed = scale !== defaults.scale || noise !== defaults.noise || retire !== defaults.retire;

  if (!state) return <div className="lab-loading">Running simulations…</div>;

  const { sim, count } = state;
  const passed = count - state.never;
  const chance = count ? passed / count : 0;
  const seasonOf = (i: number | null) => (i == null ? "—" : label(sim.current + i));
  const gap = sim.horfordNow - sim.wembyNow;
  const w = sim.wemby;
  const priorMinutes = stored.params.inSeasonPriorMinutes;
  const retireOptions = [sim.current, sim.current + 1, sim.current + 2];
  // Career season number for the season in progress (or the next one).
  const careerSeason = (p: Player) =>
    p.seasons.filter((s) => Number.parseInt(s.season.slice(0, 4), 10) + 1 < sim.current).length + 1;
  // The in-season arithmetic, before any what-if scaling.
  const restModel = (w.rate * w.priorMinutes * w.remaining) / 48;

  return (
    <>
      <section className="lab-hero shell">
        <p className="lab-kicker">THE MODEL · {TOTAL_SIMS.toLocaleString("en-US")} SIMULATED CAREERS</p>
        <h1>
          WHEN DOES WEMBANYAMA
          <br />
          PASS HORFORD?
        </h1>
        <div className="lab-headline">
          <div>
            <span>MEDIAN CROSSOVER</span>
            <strong className="volt">{seasonOf(state.median)}</strong>
            <p>The middle season among simulated careers where he gets there.</p>
          </div>
          <div>
            <span>CHANCE HE EVER DOES</span>
            <strong>
              <Tween value={chance * 100} format={(v) => `${Math.round(v)}%`} />
            </strong>
            <p>Share of the {int(count)} careers run so far that pass Horford.</p>
          </div>
          <div>
            <span>80% RANGE</span>
            <strong className="range">
              {seasonOf(state.low)}
              <em>to</em>
              {seasonOf(state.high)}
            </strong>
            <p>When it happens, it happens between these seasons four times in five.</p>
          </div>
        </div>
        <div className="sim-meter" aria-hidden="true">
          <i style={{ width: `${(count / TOTAL_SIMS) * 100}%` }} />
          <span>
            {state.done ? "SIMULATION COMPLETE" : "SIMULATING"} · {int(count)} / {int(TOTAL_SIMS)}
          </span>
        </div>
      </section>

      <section className="lab-section shell">
        <SectionHead n="01" title="THE STARTING LINE" sub="CAREER REGULAR-SEASON WIN SHARES TODAY" />
        <Reveal className="start-grid">
          <div className="start-bars">
            <div className="start-row">
              <span>WEMBANYAMA</span>
              <i>
                <b className="w" style={{ width: `${(sim.wembyNow / sim.horfordNow) * 100}%` }} />
              </i>
              <strong>{f1(sim.wembyNow)}</strong>
            </div>
            <div className="start-row">
              <span>HORFORD</span>
              <i>
                <b className="h" style={{ width: "100%" }} />
              </i>
              <strong>{f1(sim.horfordNow)}</strong>
            </div>
          </div>
          <div className="start-gap">
            <span>THE GAP</span>
            <strong>{f1(Math.max(gap, 0))}</strong>
            <p>
              Win Shares. Wembanyama is in season {careerSeason(wemby)} at age {sim.current - 2004}. Horford is in season{" "}
              {careerSeason(horford)} at {sim.current - 1987}.
            </p>
          </div>
        </Reveal>
      </section>

      <section className="lab-section shell">
        <SectionHead n="02" title="THE COMPARABLES" sub={`WHO HE LOOKED LIKE AFTER ${label(stored.wemby.checkpoint)}`} />
        <Reveal>
          <p className="lab-lede">
            The model searched every NBA and ABA season since 1960 for players who looked most like Wembanyama at the same
            age, on Win Shares per 48 minutes, box plus/minus, minutes, height and draft slot. Each line is one of the{" "}
            {stored.wemby.paths.length} closest, with the rest of his career scaled to Wembanyama&apos;s level and added to
            his total. Closer matches draw brighter. Pick a name to trace that career.
          </p>
          <CompsChart stored={stored} seasons={SEASONS} />
        </Reveal>
      </section>

      {sim.inProgress && (
        <section className="lab-section shell">
          <SectionHead n="03" title="THIS SEASON SO FAR" sub={`${label(sim.current)} · ${sim.teamGames} TEAM GAMES IN`} />
          <Reveal>
            <p className="lab-lede">
              Before the season, the comparables put Wembanyama at {f3(w.priorRate)} Win Shares per 48 minutes. His games
              so far are blended in, weighted against {int(priorMinutes)} minutes of the preseason estimate, so a hot or
              cold start moves the outlook without taking it over.
            </p>
            <ol className="work">
              <li>
                <span>PRESEASON RATE</span>
                <strong>{f3(w.priorRate)}</strong>
                <p>WS/48, from the comparables</p>
              </li>
              <li className="op">+</li>
              <li>
                <span>SO FAR</span>
                <strong>{f1(w.soFar)}</strong>
                <p>WS in {int(w.minutesSoFar)} minutes</p>
              </li>
              <li className="op">=</li>
              <li>
                <span>BLENDED RATE</span>
                <strong>{f3(w.rate)}</strong>
                <p>
                  ({f3(w.priorRate)} × {int(priorMinutes)} + {f1(w.soFar)} × 48) ÷ ({int(priorMinutes)} +{" "}
                  {int(w.minutesSoFar)})
                </p>
              </li>
              <li className="op">→</li>
              <li>
                <span>REST OF SEASON</span>
                <strong>{f1(restModel)}</strong>
                <p>
                  {f3(w.rate)} × {int(w.priorMinutes)} projected minutes ÷ 48 × {Math.round(w.remaining * 100)}% left
                </p>
              </li>
              <li className="op">=</li>
              <li className="total">
                <span>{label(sim.current)} TOTAL</span>
                <strong>{f1(w.soFar + restModel)}</strong>
                <p>expected Win Shares</p>
              </li>
            </ol>
            <p className="lab-note">
              The same blend nudges every later season: he is running at {Math.round(w.form * 100)}% of his preseason
              rate, so each future season in the simulation is scaled by {w.form.toFixed(2)}.
            </p>
          </Reveal>
        </section>
      )}

      <section className="lab-section shell">
        <SectionHead
          n={sim.inProgress ? "04" : "03"}
          title={`${int(TOTAL_SIMS)} CAREERS`}
          sub="CUMULATIVE WIN SHARES · MEDIAN, 50% AND 80% BANDS"
        />
        <div className="controls" role="group" aria-label="What-if settings">
          <label>
            <span>
              WEMBY&apos;S LEVEL <b>{Math.round(scale * 100)}%</b>
            </span>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.05}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
            />
            <small>Every future season, relative to the model</small>
          </label>
          <label>
            <span>
              YEAR-TO-YEAR SWINGS <b>{Math.round(noise * 100)}%</b>
            </span>
            <input
              type="range"
              min={0}
              max={0.8}
              step={0.05}
              value={noise}
              onChange={(e) => setNoise(Number(e.target.value))}
            />
            <small>Injuries, slumps and career years. Tuned value is {Math.round(stored.params.noise * 100)}%</small>
          </label>
          <div className="segmented">
            <span>HORFORD RETIRES</span>
            <div>
              <button type="button" className={retire === "model" ? "on" : ""} onClick={() => setRetire("model")}>
                MODEL
              </button>
              {retireOptions.map((y) => (
                <button key={y} type="button" className={retire === y ? "on" : ""} onClick={() => setRetire(y)}>
                  AFTER {label(y).replace(/^20/, "’")}
                </button>
              ))}
            </div>
            <small>The model lets his comparables decide</small>
          </div>
          <div className="control-actions">
            <button type="button" onClick={() => setRunKey((k) => k + 1)}>
              REPLAY
            </button>
            <button
              type="button"
              disabled={!changed}
              onClick={() => {
                setScale(defaults.scale);
                setNoise(defaults.noise);
                setRetire(defaults.retire);
              }}
            >
              RESET
            </button>
          </div>
        </div>
        <div className="chart-card">
          <FanChart state={state} seasons={SEASONS} />
        </div>
        <p className="lab-note">
          Each run picks one comparable career for each player, weighted by how close the match is, and adds a random
          swing to every season. The bands are where the middle half and the middle 80% of runs sit at the end of each
          season. Faint lines are individual runs.
        </p>
      </section>

      <section className="lab-section shell">
        <SectionHead
          n={sim.inProgress ? "05" : "04"}
          title="WHEN HE GETS THERE"
          sub="SEASON OF THE CROSSOVER, SHARE OF RUNS"
        />
        <div className="chart-card">
          <CrossingChart state={state} seasons={SEASONS} />
        </div>
        <p className="lab-note">
          {Math.round(chance * 100)}% of runs cross at some point. In the rest, Horford is still ahead when both
          simulated careers end. The highlighted bar holds the median crossover.
        </p>
      </section>
    </>
  );
}
