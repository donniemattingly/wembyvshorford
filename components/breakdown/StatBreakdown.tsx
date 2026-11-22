"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type Attribution, attribute, sumAttributions, winShares } from "@/lib/breakdown/engine";
import type { GameLog, PlayerKey, SeasonBreakdown } from "@/lib/breakdown/data";
import { NET_ROWS, SPLIT_ROWS, rowValue } from "@/lib/breakdown/rows";
import { useReveal, useTween } from "@/components/model/hooks";
import ContributionChart, { type Rate } from "./ContributionChart";

type Scope = "career" | "season" | "game";
type Detail = "net" | "split";

const NAMES: Record<PlayerKey, string> = { wemby: "Wembanyama", horford: "Horford" };
const f1 = (v: number) =>
  (Math.abs(v) < 0.05 ? 0 : v).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f3 = (v: number) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(3).replace(/^0/, "")}`;
const int = (v: number) => Math.round(v).toLocaleString("en-US");
const short = (season: string) => season.slice(2);
const day = (date: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

/** A player's games as picker chips: date, opponent and Win Shares (cheap, so worked out for all of them). */
const gameChips = (log: GameLog | undefined) =>
  (log?.games ?? []).map((g) => {
    const { ows, dws } = winShares(g.box, log!.context);
    return { ...g, ws: ows + dws };
  });

/** Game chips, scrolled to the newest game. */
function GamePicker({
  k,
  name,
  chips,
  at,
  set,
}: {
  k: "w" | "h";
  name: string;
  chips: ReturnType<typeof gameChips>;
  at: number;
  set: (i: number) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = strip.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);
  return (
    <div className={`bd-season-row bd-games bd-${k}`}>
      <span>{name.toUpperCase()}</span>
      <div ref={strip} role="group" aria-label={`${name} game`}>
        {chips.map((g, i) => (
          <button
            key={g.date}
            type="button"
            className={i === at ? "on" : ""}
            aria-pressed={i === at}
            title={`${day(g.date, { month: "long", day: "numeric" })} ${g.away ? "at" : "vs"} ${g.opp} · ${f1(g.ws)} WS`}
            onClick={() => set(i)}
          >
            <b>{day(g.date).toUpperCase()}</b>
            <small>
              {g.away ? "@" : ""}
              {g.opp} · {f1(g.ws)}
            </small>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Seasons in career order, with any mid-season trade stints merged. */
const bySeason = (list: SeasonBreakdown[]) => {
  const out: { season: string; teams: string[]; attribution: Attribution }[] = [];
  for (const s of list) {
    const last = out.at(-1);
    if (last?.season === s.season) {
      last.teams.push(s.team);
      last.attribution = sumAttributions([last.attribution, s.attribution]);
    } else out.push({ season: s.season, teams: [s.team], attribution: s.attribution });
  }
  return out;
};

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      <span>{label}</span>
      <div>
        {options.map(([v, text]) => (
          <button key={v} type="button" className={v === value ? "on" : ""} aria-pressed={v === value} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Score({ k, name, a, caption }: { k: "w" | "h"; name: string; a: Attribution; caption: string }) {
  const ws = useTween(a.ws);
  const ows = useTween(a.ows);
  const dws = useTween(a.dws);
  return (
    <div className={`bd-score bd-${k}`}>
      <span>{name.toUpperCase()}</span>
      <strong>{f1(ws)}</strong>
      <p>
        {caption}
        <br />
        <b>{f1(ows)}</b> offense · <b>{f1(dws)}</b> defense
      </p>
    </div>
  );
}

export default function StatBreakdown({
  seasons,
  games,
  listed,
}: {
  seasons: Record<PlayerKey, SeasonBreakdown[]>;
  games: Partial<Record<PlayerKey, GameLog>>;
  /** Games Basketball Reference lists for the latest season, to say when the breakdown is behind. */
  listed: { season: string; wemby: number; horford: number };
}) {
  const w = useMemo(() => bySeason(seasons.wemby), [seasons]);
  const h = useMemo(() => bySeason(seasons.horford), [seasons]);
  const career = useMemo(
    () => ({
      wemby: sumAttributions(w.map((s) => s.attribution)),
      horford: sumAttributions(h.map((s) => s.attribution)),
    }),
    [w, h],
  );

  const [scope, setScope] = useState<Scope>("career");
  const [rate, setRate] = useState<Rate>("per48");
  const [detail, setDetail] = useState<Detail>("net");
  // Default season view: Wembanyama's latest season against Horford's at the same point in his career. A season
  // only a few games old is too noisy to lead with, so it starts on the one before.
  const first = w.length > 1 && w[w.length - 1].attribution.games < 10 ? w.length - 2 : w.length - 1;
  const [wi, setWi] = useState(first);
  const [hi, setHi] = useState(Math.min(first, h.length - 1));
  const [ref, inView] = useReveal<HTMLDivElement>();

  // Games need both players' logs, since the chart always compares two lines.
  const wg = useMemo(() => gameChips(games.wemby), [games]);
  const hg = useMemo(() => gameChips(games.horford), [games]);
  const hasGames = wg.length > 0 && hg.length > 0;
  const [wgi, setWgi] = useState(wg.length - 1);
  const [hgi, setHgi] = useState(hg.length - 1);
  const gameAttribution = useMemo(
    () =>
      hasGames
        ? {
            wemby: attribute(wg[wgi].box, games.wemby!.context, 1),
            horford: attribute(hg[hgi].box, games.horford!.context, 1),
          }
        : null,
    [hasGames, wg, hg, wgi, hgi, games],
  );

  const pick = (key: PlayerKey) => {
    if (scope === "career") return { a: career[key], caption: careerCaption(key) };
    if (scope === "game" && gameAttribution) {
      const g = key === "wemby" ? wg[wgi] : hg[hgi];
      return {
        a: gameAttribution[key],
        caption: `${day(g.date, { month: "short", day: "numeric", year: "numeric" })} · ${g.away ? "at" : "vs"} ${g.opp} · ${g.result} · ${int(g.box.mp)} min`,
      };
    }
    const s = key === "wemby" ? w[wi] : h[hi];
    const year = (key === "wemby" ? wi : hi) + 1;
    return {
      a: s.attribution,
      caption: `${s.season} · ${s.teams.join("/")} · year ${year} · ${gamesLabel(key, s.season, s.attribution.games)}`,
    };
  };
  // The season in progress says how far it runs, and whether it trails Basketball Reference's count.
  const gamesLabel = (key: PlayerKey, season: string, played: number) => {
    if (season !== listed.season) return `${int(played)} games`;
    return played < listed[key] ? `through ${int(played)} of ${int(listed[key])} games` : `${int(played)} games so far`;
  };
  const careerCaption = (key: PlayerKey) => {
    const list = key === "wemby" ? w : h;
    const a = career[key];
    return `${list.length} seasons · ${int(a.games)} games · ${int(a.mp)} min`;
  };
  const wp = pick("wemby");
  const hp = pick("horford");
  const rows = detail === "net" ? NET_ROWS : SPLIT_ROWS;

  // The stat with the widest per-minute gap each way, for the readout under the chart.
  const per48 = (v: number, a: Attribution) => (a.mp ? (v * 48) / a.mp : 0);
  const gaps = NET_ROWS.filter((r) => r.unit).map((r) => {
    const wv = per48(rowValue(r, wp.a), wp.a);
    const hv = per48(rowValue(r, hp.a), hp.a);
    return { row: r, wv, hv, gap: wv - hv };
  });
  const wEdge = gaps.reduce((m, g) => (g.gap > m.gap ? g : m));
  const hEdge = gaps.reduce((m, g) => (g.gap < m.gap ? g : m));

  return (
    <>
      <section className="lab-hero shell">
        <p className="lab-kicker">WIN SHARES, TAKEN APART</p>
        <h1>
          WHERE THE WINS
          <br />
          COME FROM
        </h1>
        <p className="lab-lede bd-lede">
          Every made shot, miss, rebound and turnover moves a player&apos;s Win Shares up or down. This page rebuilds
          Basketball Reference&apos;s formula from the box score and credits each stat with its share.
        </p>
        <div className="bd-scores">
          <Score k="w" name={NAMES.wemby} a={wp.a} caption={wp.caption} />
          <div className="bd-vs" aria-hidden="true">
            VS
          </div>
          <Score k="h" name={NAMES.horford} a={hp.a} caption={hp.caption} />
        </div>
      </section>

      <section className="lab-section shell" aria-labelledby="bd-heading">
        <div className="section-label inverse">
          <span>01</span>
          <h2 id="bd-heading">STAT BY STAT</h2>
          <p>{scope.toUpperCase()} · REGULAR SEASON</p>
        </div>

        <div className="controls bd-controls">
          <Segmented
            label="SCOPE"
            value={scope}
            options={[["career", "CAREER"], ["season", "SEASON"], ...(hasGames ? [["game", "GAME"] as ["game", string]] : [])]}
            onChange={setScope}
          />
          <Segmented label="RATE" value={rate} options={[["per48", "PER 48 MIN"], ["total", "TOTAL"]]} onChange={setRate} />
          <Segmented label="SHOTS" value={detail} options={[["net", "NET"], ["split", "MAKES & MISSES"]]} onChange={setDetail} />
        </div>

        {scope === "season" && (
          <div className="bd-seasons">
            {(
              [
                ["wemby", w, wi, setWi, "w"],
                ["horford", h, hi, setHi, "h"],
              ] as const
            ).map(([key, list, at, set, k]) => (
              <div className={`bd-season-row bd-${k}`} key={key}>
                <span>{NAMES[key].toUpperCase()}</span>
                <div role="group" aria-label={`${NAMES[key]} season`}>
                  {list.map((s, i) => (
                    <button
                      key={s.season}
                      type="button"
                      className={i === at ? "on" : ""}
                      aria-pressed={i === at}
                      title={`${s.season} · ${f1(s.attribution.ws)} WS`}
                      onClick={() => set(i)}
                    >
                      <b>{short(s.season)}</b>
                      <small>{f1(s.attribution.ws)}</small>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {wi !== hi && wi < h.length && (
              <button type="button" className="bd-match" onClick={() => setHi(wi)}>
                Match Horford to Wembanyama&apos;s year {wi + 1} →
              </button>
            )}
          </div>
        )}

        {scope === "game" && hasGames && (
          <div className="bd-seasons">
            <GamePicker k="w" name={NAMES.wemby} chips={wg} at={wgi} set={setWgi} />
            <GamePicker k="h" name={NAMES.horford} chips={hg} at={hgi} set={setHgi} />
            <p className="bd-game-note">
              Basketball Reference doesn&apos;t publish Win Shares for single games. These use each game&apos;s box score
              against the team&apos;s season totals, so a season&apos;s games add up close to, but not exactly, its
              total.
            </p>
          </div>
        )}

        <div ref={ref} className={`reveal ${inView ? "is-in" : ""}`}>
          <ContributionChart
            a={{ key: "w", name: NAMES.wemby, attribution: wp.a }}
            b={{ key: "h", name: NAMES.horford, attribution: hp.a }}
            rows={rows}
            rate={rate}
          />
          <p className="lab-note bd-readout">
            Per 48 minutes, the widest gap in Wembanyama&apos;s favor is{" "}
            <strong>{wEdge.row.label.toLowerCase()}</strong> ({f3(wEdge.wv)} to {f3(wEdge.hv)}). In Horford&apos;s
            favor it is <strong>{hEdge.row.label.toLowerCase()}</strong> ({f3(hEdge.hv)} to {f3(hEdge.wv)}). Tap any
            stat for its counts and what each one was worth.
          </p>
        </div>
      </section>

      <section className="lab-section shell" aria-labelledby="bd-method">
        <div className="section-label inverse">
          <span>02</span>
          <h2 id="bd-method">HOW IT&apos;S SPLIT</h2>
          <p>METHOD</p>
        </div>
        <div className="model-notes bd-notes">
          <div>
            <span>THE FORMULA</span>
            <p>
              Offensive Win Shares compare the points a player produced with what a replacement-level offense would
              score on the same possessions. Defensive Win Shares do the same with his defensive rating. Rebuilt from
              each season&apos;s box score and team totals, they match Basketball Reference to the tenth.
            </p>
          </div>
          <div>
            <span>THE SPLIT</span>
            <p>
              The formula is not a simple sum, so a stat&apos;s worth depends on the rest of the line. We grow the stat
              line from zero to the real thing in small steps and credit each stat with its share of every step
              (Aumann–Shapley attribution). The pieces always add up to the total.
            </p>
          </div>
          <div>
            <span>FLOOR TIME</span>
            <p>
              A player with no stats at all still gets defensive credit for being on the court while his team defends.
              That piece belongs to no single stat, so it gets its own row. Misses and turnovers cost possessions, which
              is why they count against.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
