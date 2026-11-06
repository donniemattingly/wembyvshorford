import CareerCharts from "@/components/CareerCharts";
import ScrollFilm from "@/components/ScrollFilm";
import ModelProjection, { type BacktestLine } from "@/components/ModelProjection";
import SeasonProgress from "@/components/SeasonProgress";
import backtest from "@/lib/model/backtest.json";
import { type StoredProjection, projectCrossover } from "@/lib/model/crossover";
import projectionData from "@/lib/model/projection.json";
import { seasonInProgress, getCareerStats, horfordUrl, wembyUrl } from "@/lib/stats.server";

export const dynamic = "force-dynamic";

const format = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const backtestLines = (): BacktestLine[] => {
  const line = (label: string, detail: string, group: typeof backtest.stars): BacktestLine => ({
    label,
    detail,
    cases: group.rest.model.n,
    miss: group.rest.model.mae,
    lean: group.rest.model.bias,
    hit: group.rest.model.coverage ?? null,
  });
  return [
    line("EARLY STARS", ".150+ WS/48 in his third season, age 24 or under", backtest.stars),
    line("ELITE YOUNG PLAYERS", ".190+ WS/48 or +6 BPM, age 23 or under", backtest.elite),
    line("ALL-TIME GREATS", "the 60 best careers since 1965, picked knowing how they ended", backtest.greats),
  ];
};

const projection = projectionData as StoredProjection;

const backtestNotes = () => {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const elite100 = backtest.tails.elite[2];
  const stars = backtest.stars.next5;
  return [
    `Its odds hold up. Elite young players were given a ${pct(elite100.predicted)} chance, on average, of 100 or more further Win Shares, and ${pct(elite100.actual)} got there.`,
    `Over the next five seasons it missed early stars by ${stars.model.mae.toFixed(1)} Win Shares on average. Repeating the last season, the method this page used before, missed by ${stars.repeat.mae.toFixed(1)} and ran ${stars.repeat.bias.toFixed(1)} high.`,
    `The greats run low because they were picked knowing how their careers went. Malone, Stockton and Nash looked ordinary after three seasons, and no one could have projected what came next.`,
  ];
};

export default async function Home() {
  const stats = await getCareerStats();
  const { wemby, horford } = stats;

  const gap = Math.max(horford.winShares - wemby.winShares, 0);
  const share = Math.min((wemby.winShares / horford.winShares) * 100, 100);
  const caught = wemby.winShares >= horford.winShares;

  const season = seasonInProgress(new Date(stats.updatedAt));
  const thisSeason = wemby.seasons.find((s) => s.season === season);
  const model = projectCrossover(projection, wemby, horford, new Date(stats.updatedAt));

  // Horford's finished seasons, and the career season he is in (or about to start).
  const horfordInSeason = horford.seasons.some((s) => s.season === season);
  const horfordDone = horford.seasons.length - (horfordInSeason ? 1 : 0);
  const wembyDone = wemby.seasons.length - (thisSeason ? 1 : 0);

  const updated = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(stats.updatedAt));

  const hasSeason = Boolean(thisSeason || horford.seasons.some((s) => s.season === season));
  const n = (i: number) => String(i + (hasSeason ? 1 : 0)).padStart(2, "0");

  return (
    <main>
      <header className="masthead shell">
        <a className="wordmark" href="#top" aria-label="The Win Share Index home">
          <span>WS</span> INDEX
        </a>
        <p>CAREER LEDGER · NBA</p>
        <p className="live">
          <i /> UPDATED {updated.toUpperCase()}
        </p>
      </header>

      <section className="hero shell" id="top">
        <div className="eyebrow">
          <span>CAREER WIN SHARES</span>
          <span>REGULAR SEASON</span>
        </div>
        <h1>
          HAS VICTOR WEMBANYAMA
          <br />
          CAUGHT AL HORFORD?
        </h1>
        <div className="verdict" aria-label={caught ? "Yes" : "Not yet"}>
          <p>{caught ? "YES." : "NOT YET."}</p>
          <span>{caught ? "A NEW ORDER" : `${format(gap)} WIN SHARES TO GO`}</span>
        </div>
        <div className="hero-rule" />
        <p className="dek">
          Career regular-season Win Shares for both players, updated daily from Basketball Reference.
        </p>
      </section>

      <section className="scoreboard shell" aria-labelledby="scoreboard-heading">
        <div className="section-label">
          <span>01</span>
          <h2 id="scoreboard-heading">CAREER TOTALS</h2>
          <p>REGULAR SEASON · CAREER</p>
        </div>
        <div className="matchup">
          <article className="player player-wemby">
            <div className="player-topline">
              <span>SEASON {wembyDone + 1}</span>
              <span>SAS · C</span>
            </div>
            <img
              className="headshot"
              src="https://cdn.nba.com/headshots/nba/latest/1040x760/1641705.png"
              alt="Victor Wembanyama"
            />
            <div className="jersey" aria-hidden="true">
              1
            </div>
            <h3>
              <span>VICTOR</span>
              <strong>WEMBANYAMA</strong>
            </h3>
            <div className="stat-lockup">
              <strong>{format(wemby.winShares)}</strong>
              <span>
                CAREER
                <br />
                WIN SHARES
              </span>
            </div>
            <a href={wembyUrl}>SOURCE ↗</a>
          </article>
          <div className="versus" aria-hidden="true">
            <span>VS</span>
          </div>
          <article className="player player-horford">
            <div className="player-topline">
              <span>SEASON {horfordDone + 1}</span>
              <span>GSW · C/F</span>
            </div>
            <img className="headshot" src="https://cdn.nba.com/headshots/nba/latest/1040x760/201143.png" alt="Al Horford" />
            <div className="jersey" aria-hidden="true">
              20
            </div>
            <h3>
              <span>AL</span>
              <strong>HORFORD</strong>
            </h3>
            <div className="stat-lockup">
              <strong>{format(horford.winShares)}</strong>
              <span>
                CAREER
                <br />
                WIN SHARES
              </span>
            </div>
            <a href={horfordUrl}>SOURCE ↗</a>
          </article>
        </div>
        <div className="race">
          <div className="race-labels">
            <span>WEMBY {share.toFixed(1)}%</span>
            <span>HORFORD</span>
          </div>
          <div className="track">
            <div style={{ width: `${share}%` }}>
              <i />
            </div>
          </div>
          <p>
            {format(wemby.winShares)} <span>/</span> {format(horford.winShares)}
          </p>
        </div>
      </section>

      {season && <SeasonProgress label="02" season={season} wemby={wemby} horford={horford} />}

      <section className="visuals shell" aria-labelledby="visuals-heading">
        <div className="section-label">
          <span>{n(2)}</span>
          <h2 id="visuals-heading">SEASON BY SEASON</h2>
          <p>WIN SHARES BY CAREER YEAR</p>
        </div>
        <CareerCharts wemby={wemby} horford={horford} />
      </section>

      <ModelProjection
        label={n(3)}
        model={model}
        caught={caught}
        horfordNow={horford.winShares}
        backtest={backtestLines()}
        notes={backtestNotes()}
      />

      <section className="notes shell">
        <div className="section-label">
          <span>{n(4)}</span>
          <h2>ABOUT THE NUMBERS</h2>
          <p>METHOD</p>
        </div>
        <div className="note-grid">
          <div>
            <span>THE METRIC</span>
            <p>Win Shares estimates how many of his team&apos;s wins a player accounted for. Regular season only.</p>
          </div>
          <div>
            <span>THE DATA</span>
            <p>Career and season totals from Basketball Reference, refreshed once a day.</p>
          </div>
          <div>
            <span>THE PROJECTION</span>
            <p>
              Comparables are rebuilt after each season from every player&apos;s season totals. This season&apos;s games
              move the projection every day.
            </p>
          </div>
        </div>
      </section>

      <ScrollFilm gap={format(gap)} label={n(5)} />

      <footer className="shell">
        <p>THE WIN SHARE INDEX</p>
        <p>DATA: BASKETBALL REFERENCE · REGULAR SEASON</p>
        <p>BUILT ON CLOUDFLARE</p>
      </footer>
    </main>
  );
}
