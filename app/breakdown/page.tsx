import type { Metadata } from "next";
import { env } from "cloudflare:workers";
import StatBreakdown from "@/components/breakdown/StatBreakdown";
import { breakdownSeasons } from "@/lib/breakdown/data";
import { getLiveBreakdown } from "@/lib/breakdown/live.server";
import { cardPath } from "@/lib/og/card";
import { getCareerStats } from "@/lib/stats.server";

export const dynamic = "force-dynamic";

const title = "Where the wins come from — Wembanyama vs. Horford, stat by stat";
const description = "Win Shares split by stat: how much each shot, rebound, assist, block and turnover is worth.";

export async function generateMetadata(): Promise<Metadata> {
  const { wemby, horford } = await getCareerStats();
  const image = cardPath({ wemby: wemby.winShares, horford: horford.winShares });
  return {
    title,
    description,
    openGraph: { title, description, url: "/breakdown", images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function BreakdownPage() {
  const [stats, live] = await Promise.all([getCareerStats(), getLiveBreakdown(env.VINEXT_KV_CACHE)]);
  const updated = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(stats.updatedAt));

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

      <StatBreakdown seasons={breakdownSeasons(live)} />

      <footer className="shell">
        <p>THE WIN SHARE INDEX</p>
        <p>DATA: BASKETBALL REFERENCE · REGULAR SEASON</p>
        <p>
          <a href="/model">THE MODEL</a> · <a href="/">THE LEDGER</a>
        </p>
      </footer>
    </main>
  );
}
