import type { Crossover } from "@/lib/model/crossover";

const pct = (value: number) => `${Math.round(value * 100)}%`;

export default function ModelProjection({ label, model, caught }: { label: string; model: Crossover; caught: boolean }) {
  return (
    <section className="projection shell" aria-labelledby="projection-heading">
      <div className="section-label inverse">
        <span>{label}</span>
        <h2 id="projection-heading">PROJECTION</h2>
        <p>COMPARABLE-PLAYER MODEL · 4,000 SIMULATIONS</p>
      </div>
      <div className="projection-grid">
        <p className="kicker">{caught ? "THE CHASE IS OVER" : "PROJECTED CROSSOVER"}</p>
        <p className="big-number">{caught ? "NOW" : (model.median ?? "—")}</p>
        <p className="big-label">
          CROSSOVER
          <br />
          SEASON
        </p>
        <div className="projection-copy">
          {caught ? (
            <p>Wembanyama has passed Horford in career Win Shares.</p>
          ) : model.median ? (
            <p>
              He passes Horford in <strong>{pct(model.chance)}</strong> of 4,000 simulated careers. This is the median
              season among those, with 80% falling between {model.low} and {model.high}.
            </p>
          ) : (
            <p>He does not pass Horford in any simulated career.</p>
          )}
          <a className="model-link" href="/model">
            How the model works <span aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </section>
  );
}
