"use client";

// Draws how much each stat added to (or took from) two stat lines' Win Shares, side by side.
// It takes any two Attributions, so the same chart serves a career, a season or a game.
import { useState } from "react";
import type { Attribution } from "@/lib/breakdown/engine";
import { NOTES, type Row, rowCount, rowValue } from "@/lib/breakdown/rows";

export type Rate = "total" | "per48";

export type Side = { key: "w" | "h"; name: string; attribution: Attribution };

const scale = (a: Attribution, rate: Rate) => (rate === "per48" ? (a.mp ? 48 / a.mp : 0) : 1);

const signed = (v: number, digits: number) => {
  const text = Math.abs(v).toFixed(digits).replace(/^0\./, digits > 1 ? "." : "0.");
  // Rounds to zero: no sign, so a hair below zero doesn't read as "−.000".
  if (Math.abs(v) < 0.5 * 10 ** -digits) return text;
  return `${v < 0 ? "−" : "+"}${text}`;
};

const perEvent = (row: Row, a: Attribution) => {
  const count = rowCount(row, a);
  return count ? rowValue(row, a) / count : null;
};

// Kept outside the chart so bars stay mounted between renders and their widths animate.
function Bar(props: { v: number; s: Side; x: (v: number) => number; zero: number; digits: number; strong: boolean }) {
  const { v, s, x, zero, digits, strong } = props;
  const left = Math.min(x(v), zero);
  const width = Math.abs(x(v) - zero);
  return (
    <div className={`bd-bar bd-${s.key} ${v < 0 ? "neg" : ""} ${strong ? "strong" : ""}`}>
      <i style={{ left: `${left}%`, width: `${width}%` }} />
      <b style={v < 0 ? { left: "auto", right: `${100 - left}%` } : { right: "auto", left: `${left + width}%` }}>
        {signed(v, digits)}
      </b>
    </div>
  );
}

export default function ContributionChart({ a, b, rows, rate }: { a: Side; b: Side; rows: Row[]; rate: Rate }) {
  const [open, setOpen] = useState<string | null>(null);
  const sides = [a, b];
  const digits = rate === "per48" ? 3 : 1;
  const value = (row: Row, s: Side) => rowValue(row, s.attribution) * scale(s.attribution, rate);
  const total = (s: Side) => s.attribution.ws * scale(s.attribution, rate);
  const sideTotal = (side: Row["side"], s: Side) =>
    (side === "offense" ? s.attribution.ows : s.attribution.dws) * scale(s.attribution, rate);

  // One shared axis for every row and both players, with room for the value labels.
  const all = rows.flatMap((r) => sides.map((s) => value(r, s)));
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all, ...sides.map(total));
  const pad = (hi - lo) * 0.16 || 1;
  const min = lo < 0 ? lo - pad : 0;
  const max = hi + pad;
  const x = (v: number) => ((v - min) / (max - min)) * 100;
  const zero = x(0);

  const bar = (v: number, s: Side, strong = false) => (
    <Bar key={s.key} v={v} s={s} x={x} zero={zero} digits={digits} strong={strong} />
  );

  const groups: { side: Row["side"]; title: string; rows: Row[] }[] = [
    { side: "offense", title: "Offense", rows: rows.filter((r) => r.side === "offense") },
    { side: "defense", title: "Defense", rows: rows.filter((r) => r.side === "defense") },
  ];

  return (
    <div className="bd-chart" style={{ "--zero": `${zero}%` } as React.CSSProperties}>
      <div className="bd-head" aria-hidden="true">
        <span>STAT</span>
        <span>WIN SHARES {rate === "per48" ? "PER 48 MIN" : "ADDED"}</span>
        <span>EACH</span>
      </div>
      {groups.map((g) => (
        <div className="bd-group" key={g.side}>
          <div className="bd-group-head">
            <h3>{g.title}</h3>
            <p>
              {sides.map((s) => (
                <span key={s.key} className={`bd-${s.key}`}>
                  <i />
                  {s.name} {signed(sideTotal(g.side, s), digits)}
                </span>
              ))}
            </p>
          </div>
          {g.rows.map((row) => {
            const isOpen = open === row.key;
            return (
              <div className={`bd-row ${isOpen ? "open" : ""}`} key={row.key}>
                <button
                  type="button"
                  className="bd-label"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : row.key)}
                >
                  <strong>{row.label}</strong>
                  <small>
                    {row.unit ? sides.map((s) => row.count(s.attribution.counts)).join(" · ") : "Minutes on defense"}
                  </small>
                </button>
                <div className="bd-plot">
                  {sides.map((s) => (
                    bar(value(row, s), s)
                  ))}
                </div>
                <div className="bd-each">
                  {row.unit ? (
                    sides.map((s) => {
                      const each = perEvent(row, s.attribution);
                      return (
                        <span key={s.key} className={`bd-${s.key}`}>
                          {each == null ? "—" : signed(each, Math.abs(each) < 0.01 ? 4 : 3)}
                        </span>
                      );
                    })
                  ) : (
                    <span className="bd-muted">—</span>
                  )}
                  {row.unit && <small>per {row.unit}</small>}
                </div>
                {isOpen && (
                  <div className="bd-detail">
                    {sides.map((s) => {
                      const each = perEvent(row, s.attribution);
                      return (
                        <p key={s.key}>
                          <i className={`bd-dot bd-${s.key}`} />
                          <b>{s.name}</b>{" "}
                          {row.unit
                            ? `${row.count(s.attribution.counts)} ${rowCount(row, s.attribution) === 1 ? row.unit : `${row.unit}s`}, ${signed(rowValue(row, s.attribution), 2)} Win Shares${each == null ? "" : ` (${signed(each, 4)} each)`}.`
                            : `${Math.round(s.attribution.mp).toLocaleString("en-US")} minutes, ${signed(rowValue(row, s.attribution), 2)} Win Shares.`}
                        </p>
                      );
                    })}
                    {NOTES[row.key] && <p className="bd-note">{NOTES[row.key]}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <div className="bd-row bd-total">
        <div className="bd-label">
          <strong>Win Shares</strong>
          <small>Offense + defense</small>
        </div>
        <div className="bd-plot">
          {sides.map((s) => (
            bar(total(s), s, true)
          ))}
        </div>
        <div className="bd-each" />
      </div>
    </div>
  );
}
