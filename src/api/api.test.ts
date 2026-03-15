import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { createTestDatabase } from "../db/database.js";
import { PriceRepository } from "../db/price-repository.js";
import { NewsRepository } from "../db/news-repository.js";
import { createPricesRouter } from "./prices.js";
import { createNewsRouter } from "./news.js";
import { createTokensRouter } from "./tokens.js";
import { createSearchRouter } from "./search.js";
import type Database from "better-sqlite3";

function createTestApp(db: Database.Database) {
  const app = express();
  app.use(express.json());
  const priceRepo = new PriceRepository(db);
  const newsRepo = new NewsRepository(db);
  app.use("/api/prices", createPricesRouter(priceRepo));
  app.use("/api/news", createNewsRouter(newsRepo));
  app.use("/api/tokens", createTokensRouter(priceRepo, newsRepo));
  app.use("/api/search", createSearchRouter(db));
  return { app, priceRepo, newsRepo };
}

function seedPrices(repo: PriceRepository) {
  repo.insertPricesBatch([
    {
      tokenId: "bitcoin", symbol: "btc", name: "Bitcoin",
      priceUsd: 65000, marketCap: 1_200_000_000_000, totalVolume: 25_000_000_000,
      priceChange24h: 1500, priceChangePercentage24h: 2.3, circulatingSupply: 19_500_000,
    },
    {
      tokenId: "ethereum", symbol: "eth", name: "Ethereum",
      priceUsd: 3500, marketCap: 420_000_000_000, totalVolume: 15_000_000_000,
      priceChange24h: -50, priceChangePercentage24h: -1.4, circulatingSupply: 120_000_000,
    },
    {
      tokenId: "solana", symbol: "sol", name: "Solana",
      priceUsd: 150, marketCap: 65_000_000_000, totalVolume: 3_000_000_000,
      priceChange24h: 5, priceChangePercentage24h: 3.4, circulatingSupply: 430_000_000,
    },
  ]);
}

function seedNews(repo: NewsRepository) {
  repo.insertArticlesBatch([
    {
      guid: "article-1", title: "Bitcoin Hits New High",
      summary: "Bitcoin surged past $100K", url: "https://example.com/1",
      source: "coindesk", author: "Jane", publishedAt: "2026-03-15T12:00:00Z",
      relevanceScore: 80, tokenTags: ["btc"],
    },
    {
      guid: "article-2", title: "Ethereum DeFi Growth",
      summary: "Ethereum DeFi TVL reaches new milestone", url: "https://example.com/2",
      source: "decrypt", author: "Bob", publishedAt: "2026-03-15T11:00:00Z",
      relevanceScore: 60, tokenTags: ["eth"],
    },
    {
      guid: "article-3", title: "Solana NFT Marketplace Launch",
      summary: "New NFT marketplace launches on Solana", url: "https://example.com/3",
      source: "cointelegraph", author: null, publishedAt: "2026-03-15T10:00:00Z",
      relevanceScore: 40, tokenTags: ["sol"],
    },
  ]);
}

describe("Prices API", () => {
  let app: express.Express;
  let priceRepo: PriceRepository;

  beforeEach(() => {
    const db = createTestDatabase();
    const result = createTestApp(db);
    app = result.app;
    priceRepo = result.priceRepo;
    seedPrices(priceRepo);
  });

  describe("GET /api/prices", () => {
    it("returns all prices", async () => {
      const res = await request(app).get("/api/prices");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.count).toBe(3);
    });

    it("filters by symbol", async () => {
      const res = await request(app).get("/api/prices?symbol=btc");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].symbol).toBe("btc");
    });

    it("filters by multiple symbols", async () => {
      const res = await request(app).get("/api/prices?symbol=btc,eth");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it("sorts by price ascending", async () => {
      const res = await request(app).get("/api/prices?sort=price&order=asc");
      expect(res.status).toBe(200);
      expect(res.body.data[0].symbol).toBe("sol");
    });

    it("sorts by 24h change descending", async () => {
      const res = await request(app).get("/api/prices?sort=change&order=desc");
      expect(res.status).toBe(200);
      expect(res.body.data[0].symbol).toBe("sol"); // 3.4% > 2.3% > -1.4%
    });
  });

  describe("GET /api/prices/:symbol/history", () => {
    it("returns price history for a token", async () => {
      const res = await request(app).get("/api/prices/btc/history");
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it("returns 404 for unknown symbol", async () => {
      const res = await request(app).get("/api/prices/xyz/history");
      expect(res.status).toBe(404);
    });
  });
});

describe("News API", () => {
  let app: express.Express;

  beforeEach(() => {
    const db = createTestDatabase();
    const result = createTestApp(db);
    app = result.app;
    seedNews(result.newsRepo);
  });

  describe("GET /api/news", () => {
    it("returns articles", async () => {
      const res = await request(app).get("/api/news");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
    });

    it("filters by source", async () => {
      const res = await request(app).get("/api/news?source=coindesk");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].source).toBe("coindesk");
    });

    it("filters by token", async () => {
      const res = await request(app).get("/api/news?token=eth");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });

    it("supports pagination", async () => {
      const res = await request(app).get("/api/news?limit=1&offset=1");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.limit).toBe(1);
      expect(res.body.offset).toBe(1);
    });
  });

  describe("GET /api/news/sources", () => {
    it("returns available sources", async () => {
      const res = await request(app).get("/api/news/sources");
      expect(res.status).toBe(200);
      expect(res.body.data).toContain("coindesk");
      expect(res.body.data).toContain("decrypt");
    });
  });
});

describe("Tokens API", () => {
  let app: express.Express;

  beforeEach(() => {
    const db = createTestDatabase();
    const result = createTestApp(db);
    app = result.app;
    seedPrices(result.priceRepo);
    seedNews(result.newsRepo);
  });

  describe("GET /api/tokens/:symbol", () => {
    it("returns token overview with price and news", async () => {
      const res = await request(app).get("/api/tokens/btc");
      expect(res.status).toBe(200);
      expect(res.body.data.token.symbol).toBe("btc");
      expect(res.body.data.price).toBeDefined();
      expect(res.body.data.recentNews).toBeDefined();
    });

    it("returns 404 for unknown token", async () => {
      const res = await request(app).get("/api/tokens/xyz");
      expect(res.status).toBe(404);
    });
  });
});

describe("Search API", () => {
  let app: express.Express;

  beforeEach(() => {
    const db = createTestDatabase();
    const result = createTestApp(db);
    app = result.app;
    seedPrices(result.priceRepo);
    seedNews(result.newsRepo);
  });

  describe("GET /api/search", () => {
    it("searches tokens by name", async () => {
      const res = await request(app).get("/api/search?q=bitcoin");
      expect(res.status).toBe(200);
      expect(res.body.data.tokens.length).toBeGreaterThan(0);
    });

    it("searches articles by title", async () => {
      const res = await request(app).get("/api/search?q=DeFi");
      expect(res.status).toBe(200);
      expect(res.body.data.articles.length).toBeGreaterThan(0);
    });

    it("returns 400 when query is missing", async () => {
      const res = await request(app).get("/api/search");
      expect(res.status).toBe(400);
    });

    it("returns results for both tokens and articles", async () => {
      const res = await request(app).get("/api/search?q=sol");
      expect(res.status).toBe(200);
      expect(res.body.data.tokens.length).toBeGreaterThan(0);
      expect(res.body.data.articles.length).toBeGreaterThan(0);
    });
  });
});
