import handler from "vinext/server/fetch-handler";
import { serveCard } from "@/lib/og/render";
import { STATS_KEY, refreshIfNeeded, scrapeCareerStats } from "@/lib/stats.server";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    try {
      const url = new URL(request.url);
      if (url.hostname === "www.wembyvshorford.com") {
        url.protocol = "https:";
        url.hostname = "wembyvshorford.com";
        return Response.redirect(url, 308);
      }
      if (url.pathname === "/og.png" && (request.method === "GET" || request.method === "HEAD")) {
        return await serveCard(request, env, ctx);
      }
      if (request.method === "GET" && url.pathname === "/") ctx.waitUntil(refreshIfNeeded(env.VINEXT_KV_CACHE));
      return await handler.fetch(request, env, ctx);
    } catch (error) {
      console.error("Unhandled application error", error);
      const message = error instanceof Error ? error.message : "Unknown worker error";
      return Response.json({ error: "Application render failed", message }, { status: 500 });
    }
  },

  // Daily refresh from Basketball Reference (see triggers.crons in wrangler.jsonc).
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      scrapeCareerStats().then((stats) =>
        env.VINEXT_KV_CACHE.put(STATS_KEY, JSON.stringify(stats), { metadata: { refreshedAt: stats.updatedAt } }),
      ),
    );
  },
} satisfies ExportedHandler<Env>;
