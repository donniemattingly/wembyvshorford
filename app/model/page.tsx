import type { Metadata } from "next";
import Backtest from "@/components/model/Backtest";
import ModelLab from "@/components/model/ModelLab";
import { backtestLines, backtestNotes } from "@/lib/model/backtestSummary";
import type { StoredProjection } from "@/lib/model/crossover";
import projectionData from "@/lib/model/projection.json";
import { getCareerStats } from "@/lib/stats.server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Model — When does Wembanyama pass Horford?",
  description: "How the crossover projection works: comparable players, this season's games and 4,000 simulated careers.",
};

const projection = projectionData as StoredProjection;

export default async function ModelPage() {
  const stats = await getCareerStats();
  const updated = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(stats.updatedAt));
  const inProgress = [9, 10, 11, 0, 1, 2, 3].includes(new Date(stats.updatedAt).getUTCMonth());

  return (
    <main className="lab">
      <header className="masthead shell">
        <a className="wordmark" href="/" aria-label="The Win Share Index home">
          <span>WS</span> INDEX
        </a>
        <p>
          <a href="/">← BACK TO THE LEDGER</a>
        </p>
        <p className="live">
          <i /> UPDATED {updated.toUpperCase()}
        </p>
      </header>

      <ModelLab stored={projection} wemby={stats.wemby} horford={stats.horford} asOf={stats.updatedAt} />

      <Backtest lines={backtestLines()} notes={backtestNotes()} n={inProgress ? "06" : "05"} />

      <footer className="shell">
        <p>THE WIN SHARE INDEX</p>
        <p>DATA: BASKETBALL REFERENCE · REGULAR SEASON</p>
        <p>
          <a href="/">BACK TO THE LEDGER</a>
        </p>
      </footer>
    </main>
  );
}
