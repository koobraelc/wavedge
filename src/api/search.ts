import { Router } from "express";
import type Database from "better-sqlite3";
import { getDatabase } from "../db/database.js";

export function createSearchRouter(db?: Database.Database): Router {
  const router = Router();
  const database = db || getDatabase();

  /** GET /api/search?q=bitcoin&limit=20 — search across tokens and articles */
  router.get("/", (req, res) => {
    const query = (req.query.q as string || "").trim();
    if (!query) {
      res.status(400).json({ error: "Query parameter 'q' is required" });
      return;
    }

    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 100);
    const pattern = `%${query}%`;

    const tokens = database
      .prepare(
        `SELECT t.id, t.symbol, t.name, p.price_usd, p.market_cap
         FROM tokens t
         LEFT JOIN prices p ON p.token_id = t.id
           AND p.fetched_at = (SELECT MAX(p2.fetched_at) FROM prices p2 WHERE p2.token_id = t.id)
         WHERE t.symbol LIKE ? OR t.name LIKE ?
         ORDER BY p.market_cap DESC NULLS LAST
         LIMIT ?`
      )
      .all(pattern, pattern, limit) as Record<string, unknown>[];

    const articles = database
      .prepare(
        `SELECT id, guid, title, summary, url, source, published_at, relevance_score, token_tags
         FROM articles
         WHERE title LIKE ? OR summary LIKE ?
         ORDER BY relevance_score DESC, published_at DESC
         LIMIT ?`
      )
      .all(pattern, pattern, limit) as Record<string, unknown>[];

    res.json({
      data: { tokens, articles },
      query,
    });
  });

  return router;
}
