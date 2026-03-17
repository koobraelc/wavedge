import { Router } from "express";
import { getPool } from "../db/database.js";
import { SocialRepository } from "../db/social-repository.js";
import { optionalAuth, type AuthenticatedRequest } from "../services/auth.js";

interface SentimentRow {
  avg_change: number;
}

interface WatchlistTokenRow {
  symbol: string;
  name: string;
  price_usd: number;
  price_change_percentage_24h: number | null;
  market_cap: number | null;
  news_count_24h: number;
}

export function createHomepageRouter(): Router {
  const router = Router();

  /**
   * GET /api/homepage/sentiment
   * Aggregate impact scores from last 24h to compute market sentiment.
   */
  router.get("/sentiment", async (_req, res) => {
    try {
      const pool = getPool();
      const result = await pool.query(
        `SELECT ie.article_id, AVG(ie.change_24h) AS avg_change
         FROM impact_events ie
         JOIN articles a ON a.id = ie.article_id
         WHERE a.published_at >= NOW() - INTERVAL '24 hours'
           AND ie.change_24h IS NOT NULL
         GROUP BY ie.article_id`
      );
      const rows = result.rows as SentimentRow[];

      let bullish = 0;
      let bearish = 0;
      let neutral = 0;

      for (const row of rows) {
        if (row.avg_change > 0.1) {
          bullish++;
        } else if (row.avg_change < -0.1) {
          bearish++;
        } else {
          neutral++;
        }
      }

      const total = bullish + bearish + neutral;
      const score = total > 0 ? Math.round(((bullish - bearish) / total) * 100) : 0;
      const label = score > 10 ? "Bullish" : score < -10 ? "Bearish" : "Neutral";

      res.json({ data: { bullish, bearish, neutral, score, label } });
    } catch (err) {
      console.error("[Homepage] Sentiment error:", err);
      res.status(500).json({ error: "Failed to compute sentiment" });
    }
  });

  /**
   * GET /api/homepage/watchlist
   * Authenticated: tokens from user's alert preferences with prices + news count.
   * Unauthenticated: top 8 tokens by market cap.
   */
  router.get("/watchlist", optionalAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const pool = getPool();
      const userId = req.user?.id;
      let userSymbols: string[] | null = null;

      if (userId) {
        const prefsResult = await pool.query(
          `SELECT token_symbols FROM alert_preferences WHERE user_id = $1`,
          [userId]
        );

        if (prefsResult.rows.length > 0) {
          const parsed = JSON.parse(prefsResult.rows[0].token_symbols) as string[];
          if (parsed.length > 0) {
            userSymbols = parsed.map((s) => s.toLowerCase());
          }
        }
      }

      let tokens: WatchlistTokenRow[];

      if (userSymbols && userSymbols.length > 0) {
        const placeholders = userSymbols.map((_, i) => `$${i + 1}`).join(",");
        const result = await pool.query(
          `SELECT t.symbol, t.name, p.price_usd, p.price_change_percentage_24h, p.market_cap,
                  (SELECT COUNT(*) FROM articles a
                   WHERE a.published_at >= NOW() - INTERVAL '24 hours'
                     AND a.token_tags LIKE '%"' || UPPER(t.symbol) || '"%') AS news_count_24h
           FROM tokens t
           JOIN (SELECT token_id, MAX(fetched_at) as max_fetched FROM prices GROUP BY token_id) lp ON lp.token_id = t.id
           JOIN prices p ON p.token_id = lp.token_id AND p.fetched_at = lp.max_fetched
           WHERE t.symbol IN (${placeholders})
           ORDER BY p.market_cap DESC`,
          userSymbols
        );
        tokens = result.rows as WatchlistTokenRow[];
      } else {
        const result = await pool.query(
          `SELECT t.symbol, t.name, p.price_usd, p.price_change_percentage_24h, p.market_cap,
                  (SELECT COUNT(*) FROM articles a
                   WHERE a.published_at >= NOW() - INTERVAL '24 hours'
                     AND a.token_tags LIKE '%"' || UPPER(t.symbol) || '"%') AS news_count_24h
           FROM tokens t
           JOIN (SELECT token_id, MAX(fetched_at) as max_fetched FROM prices GROUP BY token_id) lp ON lp.token_id = t.id
           JOIN prices p ON p.token_id = lp.token_id AND p.fetched_at = lp.max_fetched
           ORDER BY p.market_cap DESC
           LIMIT 8`
        );
        tokens = result.rows as WatchlistTokenRow[];
      }

      res.json({
        data: {
          tokens: tokens.map((t) => ({
            symbol: t.symbol,
            name: t.name,
            price: t.price_usd,
            change_24h: t.price_change_percentage_24h,
            market_cap: t.market_cap,
            news_count_24h: t.news_count_24h,
          })),
        },
      });
    } catch (err) {
      console.error("[Homepage] Watchlist error:", err);
      res.status(500).json({ error: "Failed to fetch watchlist" });
    }
  });

  /**
   * GET /api/homepage/social-sentiment
   * Latest social sentiment across all tracked tokens.
   */
  router.get("/social-sentiment", async (_req, res) => {
    try {
      const socialRepo = new SocialRepository();
      const all = await socialRepo.getLatestAll();

      res.json({
        data: {
          tokens: all.map((s) => ({
            symbol: s.token_symbol,
            mentionCount: s.mention_count,
            sentimentScore: s.sentiment_score,
            sentimentLabel: s.sentiment_label,
            source: s.source,
            fetchedAt: s.fetched_at,
          })),
        },
      });
    } catch (err) {
      console.error("[Homepage] Social sentiment error:", err);
      res.status(500).json({ error: "Failed to fetch social sentiment" });
    }
  });

  return router;
}
