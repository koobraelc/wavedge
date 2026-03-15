import { Router } from "express";
import { PriceRepository } from "../db/price-repository.js";
import { NewsRepository } from "../db/news-repository.js";

export function createTokensRouter(priceRepo?: PriceRepository, newsRepo?: NewsRepository): Router {
  const router = Router();
  const prices = priceRepo || new PriceRepository();
  const news = newsRepo || new NewsRepository();

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

  return router;
}
