import { Router } from "express";
import { PriceRepository } from "../db/price-repository.js";
import { NewsRepository } from "../db/news-repository.js";
import { ImpactRepository } from "../db/impact-repository.js";
import { SummaryService } from "../services/summary-service.js";

export function createTokensRouter(
  priceRepo?: PriceRepository,
  newsRepo?: NewsRepository,
  impactRepo?: ImpactRepository,
  summaryService?: SummaryService
): Router {
  const router = Router();
  const prices = priceRepo || new PriceRepository();
  const news = newsRepo || new NewsRepository();
  const impact = impactRepo || new ImpactRepository();
  const summaries = summaryService || new SummaryService(impact);

  /** GET /api/tokens/:symbol — token overview (price + news + metadata) */
  router.get("/:symbol", (req, res) => {
    const token = prices.getTokenBySymbol(req.params.symbol);
    if (!token) {
      res.status(404).json({ error: "Token not found" });
      return;
    }

    const history = prices.getPriceHistory(token.id, 1);
    const latestPrice = history[0] || null;
    const articles = news.getArticles({ tokenTag: token.symbol, limit: 10 });

    res.json({
      data: {
        token,
        price: latestPrice,
        recentNews: articles,
      },
    });
  });

  /** GET /api/tokens/:symbol/impact — historical impact statistics by news category */
  router.get("/:symbol/impact", (req, res) => {
    const symbol = req.params.symbol.toLowerCase();
    const token = prices.getTokenBySymbol(symbol);
    if (!token) {
      res.status(404).json({ error: "Token not found" });
      return;
    }

    const stats = impact.getImpactStatsByToken(token.symbol);
    const recentArticles = impact.getRecentClassifiedArticles(token.symbol, 30);

    res.json({
      data: {
        symbol: token.symbol.toUpperCase(),
        categories: stats,
        recentArticleCount: recentArticles.length,
        totalEvents: stats.reduce((sum, s) => sum + s.sampleSize, 0),
      },
    });
  });

  /** GET /api/tokens/:symbol/summary — AI-generated 7-day summary */
  router.get("/:symbol/summary", async (req, res) => {
    const symbol = req.params.symbol.toLowerCase();
    const token = prices.getTokenBySymbol(symbol);
    if (!token) {
      res.status(404).json({ error: "Token not found" });
      return;
    }

    const lang = req.query.lang === "zh" ? "zh" : "en";

    try {
      const summary = await summaries.getSummary(token.symbol, lang);
      if (!summary) {
        res.json({
          data: null,
          message: "No news data available for summary generation",
        });
        return;
      }
      res.json({ data: summary });
    } catch (error) {
      console.error("Summary generation error:", error);
      res.status(500).json({ error: "Failed to generate summary" });
    }
  });

  return router;
}
