import { Resvg, initWasm } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import { getCareerStats } from "@/lib/stats.server";
import { cardSvg, cardVersion } from "./card";

const FONT_PATHS = ["/fonts/Anton-Regular.ttf", "/fonts/ArchivoBlack-Regular.ttf"];

let ready: Promise<void> | undefined;
let fonts: Promise<Uint8Array[]> | undefined;

const loadFonts = (assets: Fetcher, origin: string) =>
  Promise.all(
    FONT_PATHS.map(async (path) => {
      const response = await assets.fetch(new URL(path, origin));
      if (!response.ok) throw new Error(`Font ${path} returned ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    }),
  );

// Serves /og.png: the share card drawn from the stats in KV. A request carrying the current ?v= is
// cached for a year (the URL changes when the numbers do); anything else is cached briefly.
export const serveCard = async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
  const url = new URL(request.url);
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(url.toString(), { method: "GET" });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const stats = await getCareerStats();
  const numbers = { wemby: stats.wemby.winShares, horford: stats.horford.winShares };
  const current = url.searchParams.get("v") === cardVersion(numbers);

  ready ??= initWasm(resvgWasm).catch((error) => {
    ready = undefined;
    throw error;
  });
  fonts ??= loadFonts(env.ASSETS, url.origin).catch((error) => {
    fonts = undefined;
    throw error;
  });
  const [, fontBuffers] = await Promise.all([ready, fonts]);

  const png = new Resvg(cardSvg(numbers), {
    font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: "Archivo Black" },
  })
    .render()
    .asPng();

  const response = new Response(png as Uint8Array<ArrayBuffer>, {
    headers: {
      "content-type": "image/png",
      "cache-control": current ? "public, max-age=31536000, immutable" : "public, max-age=600",
    },
  });
  if (request.method === "GET") ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
