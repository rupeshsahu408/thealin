import { Router, type IRouter } from "express";

const router: IRouter = Router();

const NASA_API =
  "https://exoplanetarchive.ipac.caltech.edu/TAP/sync";

const FIELDS =
  "pl_name,sy_dist,st_spectype,st_teff,pl_orbsmax,pl_rade,pl_bmassj,pl_eqt,disc_year";

const QUERY = `SELECT ${FIELDS} FROM pscomppars WHERE pl_name IS NOT NULL AND sy_dist IS NOT NULL`;

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

router.get("/planets", async (_req, res) => {
  try {
    const now = Date.now();
    if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
      res.setHeader("X-Cache", "HIT");
      return res.json(cache.data);
    }

    const url = new URL(NASA_API);
    url.searchParams.set("query", QUERY);
    url.searchParams.set("format", "json");
    url.searchParams.set("maxrec", "5600");

    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`NASA API returned ${response.status}`);
    }

    const data = await response.json();
    cache = { data, fetchedAt: now };

    res.setHeader("X-Cache", "MISS");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.json(data);
  } catch (err: any) {
    return res.status(502).json({
      error: "Failed to fetch planet data",
      message: err?.message ?? "Unknown error",
    });
  }
});

export default router;
