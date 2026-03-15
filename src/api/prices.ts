import { Router } from "express";
import { PriceRepository } from "../db/price-repository.js";

export function createPricesRouter(repo?: PriceRepository): Router {
  const router = Router();
  const priceRepo = repo || new PriceRepository();

  /** GET /api/prices — latest prices with filtering and sorting */
  router.get("/", (req, res) => {
    const sort = (req.query.sort as string) || "market_cap";
    const order = (req.query.order as string) === "asc" ? "asc" : "desc";
    const symbol = (req.query.symbol as string) || undefined;

    let prices = priceRepo.getLatestPrices();

    if (symbol) {
      const symbols = symbol.toLowerCase().split(",");
      prices = prices.filter((p) => symbols.includes(p.symbol));
    }

    if (sort === "price") {
      prices.sort((a, b) => order === "asc" ? a.price_usd - b.price_usd : b.price_usd - a.price_usd);
    } else if (sort === "change") {
      prices.sort((a, b) => {
        const aVal = a.price_change_percentage_24h ?? 0;
        const bVal = b.price_change_percentage_24h ?? 0;
        return order === "asc" ? aVal - bVal : bVal - aVal;
      });
    }

    res.json({ data: prices, count: prices.length });
  });

  /** GET /api/prices/:symbol/history?limit=288 — historical price data */
  router.get("/:symbol/history", (req, res) => {
    const token = priceRepo.getTokenBySymbol(req.params.symbol);
    if (!token) {
      res.status(404).json({ error: "Token not found" });
      return;
    }

    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 288), 5000);
    const history = priceRepo.getPriceHistory(token.id, limit);
    res.json({ data: history, count: history.length });
  });

  return router;
}
