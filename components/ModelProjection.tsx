import type { Crossover } from "@/lib/model/crossover";

export type BacktestLine = {
  label: string;
  detail: string;
  cases: number;
  miss: number;
  lean: number;
  hit: number | null;
};

const format = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (value: number) => `${Math.round(value * 100)}%`;
const signed = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(0)}`;

export default function ModelProjection({
  label,
  model,
  caught,
  horfordNow,
  backtest,
  notes,
}: {
  label: string;
  model: Crossover;
  caught: boolean;
  horfordNow: number;
  backtest: BacktestLine[];
  notes: string[];
}) {
  const bars = model.byseason.filter((s, i) => i < 12 && (i === 0 || model.byseason[i - 1].chance < 0.995));

  return (
    <section className="projection shell" aria-labelledby="projection-heading">
      <div className="section-label inverse">
        <span>{label}</span>
        <h2 id="projection-heading">PROJECTION</h2>
        <p>COMPARABLE-PLAYER MODEL · 4,000 SIMULATIONS</p>
      </div>
      <div className="projection-grid">
        <p className="kicker">
          {caught ? "THE CHASE IS OVER" : `HE PASSES HORFORD IN ${pct(model.chance)} OF SIMULATED CAREERS`}
        </p>
        <p className="big-number">{caught ? "NOW" : (model.median ?? "—")}</p>
        <p className="big-label">
          CROSSOVER
          <br />
          SEASON
        </p>
        {caught ? (
          <p className="projection-copy">Wembanyama has passed Horford in career Win Shares.</p>
        ) : model.median ? (
          <p className="projection-copy">
            The middle season among the careers where he gets there. In 80% of those, he passes Horford between{" "}
            <strong>{model.low}</strong> and <strong>{model.high}</strong>. In the other {pct(1 - model.chance)}, he
            retires short of him.
          </p>
        ) : (
          <p className="projection-copy">He does not pass Horford in any simulated career.</p>
        )}
      </div>

      <div className="pace-grid model-grid">
        <div>
          <span>WEMBY, {model.current}</span>
          <strong>{format(model.wemby.total)}</strong>
          <p>
            projected Win Shares: {format(model.wemby.soFar)} so far plus {format(model.wemby.rest)} to come. 80% range{" "}
            {format(model.wemby.low)} to {format(model.wemby.high)}.
          </p>
        </div>
        <div>
          <span>WEMBY, CAREER</span>
          <strong>{Math.round(model.wemby.careerMedian)}</strong>
          <p>career Win Shares in the median simulation.</p>
        </div>
        <div>
          <span>HORFORD, FINAL</span>
          <strong>{format(model.horford.finalMedian)}</strong>
          <p>
            career Win Shares in the median simulation, up from {format(horfordNow)} today.
          </p>
        </div>
      </div>

      {!caught && (
        <div className="odds">
          <span className="odds-title">CHANCE HE HAS PASSED HORFORD BY THE END OF</span>
          <ol>
            {bars.map((s) => (
              <li key={s.season}>
                <span>{s.season}</span>
                <i>
                  <b style={{ width: `${s.chance * 100}%` }} />
                </i>
                <em>{s.chance < 0.005 ? "<1%" : s.chance > 0.995 ? ">99%" : pct(s.chance)}</em>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="model-notes">
        <div>
          <span>HOW IT WORKS</span>
          <p>
            The model looks at every NBA and ABA season since 1960 and finds the players who looked most like
            Wembanyama at 22: Win Shares per 48 minutes, box plus/minus, minutes and last season&apos;s Win Shares. It
            follows what they did next, scaled by how much better or worse he is than each of them, so he is measured
            against the best young players ever rather than an average one. Height and draft slot count
            too: taller players and higher picks have outrun comparables with the same numbers, so a comparable who
            was shorter or drafted later is nudged up. Injuries and short careers
            among the comparables count.
          </p>
          <p>
            Next season leans on a plain aging curve for players of his age and level; later seasons lean on the
            comparables. This season&apos;s games so far are blended in, weighted by minutes. Horford gets the same
            treatment. Each of the 4,000 simulations draws one comparable career for each player and adds
            season-to-season noise.
          </p>
          <p className="comps">
            Closest comparables: {model.comps.map((c) => `${c.name} (${c.season.replace("-", "–")})`).join(", ")}.
          </p>
        </div>
        <div>
          <span>HOW IT HAS DONE</span>
          <p>
            Tested on past players using only their first two to four seasons, with each player left out of his own
            comparables. The table shows the miss on the rest of each career, in Win Shares, for checkpoints at least
            20 seasons back. Lean is how far it ran high (+) or low (−) on average.
          </p>
          <table className="backtest">
            <thead>
              <tr>
                <th scope="col">GROUP</th>
                <th scope="col">TESTS</th>
                <th scope="col">AVG MISS</th>
                <th scope="col">LEAN</th>
                <th scope="col">IN 80% RANGE</th>
              </tr>
            </thead>
            <tbody>
              {backtest.map((b) => (
                <tr key={b.label}>
                  <th scope="row">
                    {b.label}
                    <small>{b.detail}</small>
                  </th>
                  <td>{b.cases}</td>
                  <td>{b.miss.toFixed(0)}</td>
                  <td>{signed(b.lean)}</td>
                  <td>{b.hit == null ? "—" : pct(b.hit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      </div>
    </section>
  );
}
