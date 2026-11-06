import type { Player } from "@/lib/stats.server";

const cumulative = (values: number[]) => {
  let total = 0;
  return values.map((value) => (total += value));
};

const points = (values: number[], seasons: number, max: number) =>
  values.map((value, i) => `${50 + (i / (seasons - 1)) * 850},${330 - (value / max) * 275}`).join(" ");

export default function CareerCharts({ wemby, horford }: { wemby: Player; horford: Player }) {
  const wembyTotals = cumulative(wemby.seasons.map((s) => s.winShares));
  const horfordTotals = cumulative(horford.seasons.map((s) => s.winShares));
  const seasons = Math.max(wemby.seasons.length, horford.seasons.length);
  const max = Math.ceil(Math.max(...horfordTotals, ...wembyTotals) / 20) * 20;
  const horfordEarly = horford.seasons.slice(0, 3);
  const earlyMax = Math.max(
    ...horfordEarly.map((s) => s.winShares),
    ...wemby.seasons.slice(0, 3).map((s) => s.winShares),
  );
  const wembyLatest = wembyTotals.at(-1)!;
  const wembyX = 50 + ((wembyTotals.length - 1) / (seasons - 1)) * 850;

  return (
    <div className="charts-grid">
      <article className="trajectory-card">
        <div className="chart-heading">
          <div>
            <span>CAREER TRAJECTORY</span>
            <h3>
              THE LONG
              <br />
              ACCUMULATION
            </h3>
          </div>
          <div className="legend">
            <i className="legend-wemby" /> WEMBY <i className="legend-horford" /> HORFORD
          </div>
        </div>
        <svg className="trajectory" viewBox="0 0 950 370" role="img" aria-label="Cumulative Win Shares by career season">
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
            <g key={tick}>
              <line x1="50" x2="900" y1={330 - tick * 275} y2={330 - tick * 275} />
              <text x="40" y={334 - tick * 275} textAnchor="end">
                {Math.round(tick * max)}
              </text>
            </g>
          ))}
          <polyline className="horford-line" points={points(horfordTotals, seasons, max)} />
          <polyline className="wemby-line" points={points(wembyTotals, seasons, max)} />
          <circle className="wemby-dot" cx={wembyX} cy={330 - (wembyLatest / max) * 275} r="8" />
          <text className="alien-label" x={wembyX + 32} y={324 - (wembyLatest / max) * 275}>
            ALIEN SIGNAL
          </text>
          <text className="axis-label" x="50" y="360">
            YEAR 1
          </text>
          <text className="axis-label" x="900" y="360" textAnchor="end">
            YEAR {seasons}
          </text>
        </svg>
        <p className="chart-note">
          Horford says adding the three-pointer added years to his career. The career accepted the extension.
        </p>
      </article>

      <article className="early-card">
        <div className="chart-heading">
          <div>
            <span>FIRST THREE SEASONS</span>
            <h3>
              ORBITAL
              <br />
              VELOCITY
            </h3>
          </div>
          <b>WS / SEASON</b>
        </div>
        <div className="bar-chart">
          {[0, 1, 2].map((i) => {
            const w = wemby.seasons[i];
            const h = horfordEarly[i];
            return (
              <div className="bar-group" key={i}>
                <div className="bar-values">
                  <span>{w?.winShares.toFixed(1)}</span>
                  <span>{h?.winShares.toFixed(1)}</span>
                </div>
                <div className="bars">
                  <i className="bar-wemby" style={{ height: `${((w?.winShares ?? 0) / earlyMax) * 100}%` }} />
                  <i className="bar-horford" style={{ height: `${((h?.winShares ?? 0) / earlyMax) * 100}%` }} />
                </div>
                <p>YEAR {i + 1}</p>
              </div>
            );
          })}
        </div>
        <div className="bar-key">
          <span>
            <i className="bar-wemby" /> WEMBY
          </span>
          <span>
            <i className="bar-horford" /> HORFORD
          </span>
        </div>
        <p className="chart-note">
          By year three, Wemby was at 10.0 Win Shares; Horford was at 10.9. Similar output. Very different ways of
          getting there.
        </p>
      </article>
    </div>
  );
}
