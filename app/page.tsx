import CareerCharts from "@/components/CareerCharts";
import ScrollFilm from "@/components/ScrollFilm";
import SeasonProgress from "@/components/SeasonProgress";
import { seasonInProgress, getCareerStats, horfordUrl, wembyUrl } from "@/lib/stats.server";

export const dynamic = "force-dynamic";

const GAMES_PER_SEASON = 82;

const format = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const seasonSpan = (startYear: number) => `${startYear}–${String(startYear + 1).slice(-2)}`;

// Games needed to close the gap at a win-shares-per-game rate, or null if that rate never gets there.
const gamesToCatch = (gap: number, winShares: number, games: number | undefined) =>
  games && winShares > 0 ? gap / (winShares / games) : null;

export default async function Home() {
  const stats = await getCareerStats();
  const { wemby, horford } = stats;

  const gap = Math.max(horford.winShares - wemby.winShares, 0);
  const share = Math.min((wemby.winShares / horford.winShares) * 100, 100);
  const caught = wemby.winShares >= horford.winShares;

  // "Last season" means the last finished one, not the season in progress.
  const season = seasonInProgress(new Date(stats.updatedAt));
  const thisSeason = wemby.seasons.find((s) => s.season === season);
  const lastSeason = wemby.seasons.filter((s) => s.season !== season).at(-1);
  const lastSeasonWs = lastSeason?.winShares ?? 0;
  // Count seasons from the one after the last finished season. If that season is already under way, its
  // partial total is replaced by a full repeat rather than added on top of one.
  const wembyBeforeNext = wemby.winShares - (thisSeason?.winShares ?? 0);
  const seasonsToGo =
    lastSeasonWs > 0 ? Math.max(Math.ceil((horford.winShares - wembyBeforeNext) / lastSeasonWs), 1) : Infinity;
  const lastStart = Number.parseInt(lastSeason?.season.slice(0, 4) ?? "", 10);
  const crossover = Number.isFinite(seasonsToGo) && Number.isFinite(lastStart) ? seasonSpan(lastStart + seasonsToGo) : "—";
  const lastLabel = Number.isFinite(lastStart) ? seasonSpan(lastStart) : "LAST SEASON";

  // Horford's finished seasons, and the career season he is in (or about to start).
  const horfordInSeason = horford.seasons.some((s) => s.season === season);
  const horfordDone = horford.seasons.length - (horfordInSeason ? 1 : 0);
  const wembyDone = wemby.seasons.length - (thisSeason ? 1 : 0);

  const careerPace = gamesToCatch(gap, wemby.winShares, wemby.games);
  const seasonPace = thisSeason ? gamesToCatch(gap, thisSeason.winShares, thisSeason.games) : null;

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

      <section className="projection shell" aria-labelledby="projection-heading">
        <div className="section-label inverse">
          <span>{n(3)}</span>
          <h2 id="projection-heading">PROJECTION</h2>
          <p>HORFORD HELD AT HIS CURRENT TOTAL</p>
        </div>
        <div className="projection-grid">
          <p className="kicker">{caught ? "THE CHASE IS OVER" : `IF WEMBY REPEATS ${lastLabel}`}</p>
          <p className="big-number">{caught ? "NOW" : crossover}</p>
          <p className="big-label">
            CROSSOVER
            <br />
            SEASON
          </p>
          {caught ? (
            <p className="projection-copy">
              Wembanyama has <strong>{format(wemby.winShares)} career Win Shares</strong> to Horford&apos;s{" "}
              {format(horford.winShares)}. He has passed Horford.
            </p>
          ) : (
            <p className="projection-copy">
              Wembanyama produced <strong>{format(lastSeasonWs)} Win Shares in {lastLabel}.</strong> At that rate, with
              Horford held at {format(horford.winShares)}, he passes Horford during {crossover}.
            </p>
          )}
        </div>
        {!caught && (careerPace != null || seasonPace != null) && (
          <div className="pace-grid">
            {seasonPace != null && (
              <div>
                <span>AT THIS SEASON&apos;S PACE</span>
                <strong>{Math.ceil(seasonPace).toLocaleString("en-US")}</strong>
                <p>more games, about {format(seasonPace / GAMES_PER_SEASON)} full seasons.</p>
              </div>
            )}
            {careerPace != null && (
              <div>
                <span>AT HIS CAREER PACE</span>
                <strong>{Math.ceil(careerPace).toLocaleString("en-US")}</strong>
                <p>more games, about {format(careerPace / GAMES_PER_SEASON)} full seasons.</p>
              </div>
            )}
          </div>
        )}
      </section>

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
            <span>THE PACE FIGURES</span>
            <p>
              Games needed at Wembanyama&apos;s Win Shares per game, this season and for his career, with Horford held
              where he is. Early-season figures move a lot.
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
