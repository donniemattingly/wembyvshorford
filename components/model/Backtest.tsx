import type { BacktestLine } from "@/lib/model/backtestSummary";

const pct = (value: number) => `${Math.round(value * 100)}%`;
const signed = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(0)}`;

export default function Backtest({ lines, notes, n }: { lines: BacktestLine[]; notes: string[]; n: string }) {
  return (
    <section className="lab-section shell">
      <div className="section-label inverse">
        <span>{n}</span>
        <h2>HOW IT HAS DONE</h2>
        <p>BACKTEST ON PAST PLAYERS</p>
      </div>
      <div className="model-notes">
        <div>
          <span>THE TEST</span>
          <p>
            The model was run on past players using only their first two to four seasons, with each player left out of
            his own comparables, then checked against how the rest of his career went. The table covers checkpoints at
            least 20 seasons back, so those careers are finished.
          </p>
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
        <div>
          <span>MISS ON THE REST OF THE CAREER, IN WIN SHARES</span>
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
              {lines.map((b) => (
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
          <p className="lab-note">Lean is how far it ran high (+) or low (−) on average.</p>
        </div>
      </div>
    </section>
  );
}
