import type { Player, Season } from "@/lib/stats.server";

const format = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const formatPer48 = (value: number | null | undefined) => (value == null ? "—" : value.toFixed(3).replace(/^0/, ""));

function Row({ name, season }: { name: string; season: Season | undefined }) {
  return (
    <tr>
      <th scope="row">{name}</th>
      <td>{season?.games ?? "—"}</td>
      <td>{season ? format(season.winShares) : "—"}</td>
      <td>{formatPer48(season?.winSharesPer48)}</td>
    </tr>
  );
}

export default function SeasonProgress({
  label,
  season,
  wemby,
  horford,
}: {
  label: string;
  season: string;
  wemby: Player;
  horford: Player;
}) {
  const wembySeason = wemby.seasons.find((s) => s.season === season);
  const horfordSeason = horford.seasons.find((s) => s.season === season);
  if (!wembySeason && !horfordSeason) return null;

  const gapNow = horford.winShares - wemby.winShares;
  const gapClosed = (wembySeason?.winShares ?? 0) - (horfordSeason?.winShares ?? 0);
  const gapAtStart = gapNow + gapClosed;

  return (
    <section className="season shell" aria-labelledby="season-heading">
      <div className="section-label">
        <span>{label}</span>
        <h2 id="season-heading">THIS SEASON</h2>
        <p>{season} · IN PROGRESS</p>
      </div>
      <div className="season-grid">
        <table className="season-table">
          <thead>
            <tr>
              <th scope="col">PLAYER</th>
              <th scope="col">GP</th>
              <th scope="col">WS</th>
              <th scope="col">WS/48</th>
            </tr>
          </thead>
          <tbody>
            <Row name="WEMBANYAMA" season={wembySeason} />
            <Row name="HORFORD" season={horfordSeason} />
          </tbody>
        </table>
        {gapNow > 0 && (
          <div className="season-gap">
            <span>GAP CLOSED THIS SEASON</span>
            <strong>
              {gapClosed >= 0 ? "−" : "+"}
              {format(Math.abs(gapClosed))}
            </strong>
            <p>
              The gap is {format(gapNow)} Win Shares, {gapClosed >= 0 ? "down" : "up"} from {format(gapAtStart)} on
              opening night.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
