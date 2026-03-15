import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createTestDatabase } from "../db/database.js";
import { PriceRepository } from "../db/price-repository.js";
import { NewsRepository } from "../db/news-repository.js";
import { ImpactRepository } from "../db/impact-repository.js";
import { SummaryService } from "../services/summary-service.js";
import { createTokensRouter } from "./tokens.js";

function createApp() {
  const db = createTestDatabase();
  const priceRepo = new PriceRepository(db);
  const newsRepo = new NewsRepository(db);
  const impactRepo = new ImpactRepository(db);
  const summaryService = new SummaryService(impactRepo, db); // no API key = fallback mode
  const app = express();
  app.use(express.json());
  app.use(
    "/api/tokens",
    createTokensRouter(priceRepo, newsRepo, impactRepo, summaryService)
  );
  return { app, priceRepo, newsRepo, impactRepo };
}

function seedToken(priceRepo: PriceRepository) {
  priceRepo.insertPrice({
    tokenId: "bitcoin",
    symbol: "btc",
    name: "Bitcoin",
    priceUsd: 85000,
    marketCap: 1.6e12,
    totalVolume: 30e9,
    priceChange24h: 1200,
    priceChangePercentage24h: 1.43,
    circulatingSupply: 19e6,
  });
}

const sampleArticle = {
  guid: "art-1",
  title: "SEC Approves Spot Bitcoin ETF",
  summary: "The SEC has approved a spot Bitcoin ETF application.",
  url: "https://example.com/1",
  source: "CoinDesk",
  author: "Alice",
  publishedAt: new Date().toISOString(),
  relevanceScore: 0.9,
  tokenTags: ["BTC"],
};

describe("GET /api/tokens/:symbol", () => {
  it("returns 404 for unknown token", async () => {
    const { app } = createApp();
    const res = await request(app).get("/api/tokens/xyz");
    expect(res.status).toBe(404);
  });

  it("returns token overview", async () => {
    const { app, priceRepo } = createApp();
    seedToken(priceRepo);
    const res = await request(app).get("/api/tokens/btc");
    expect(res.status).toBe(200);
    expect(res.body.data.token.symbol).toBe("btc");
    expect(res.body.data.price).toBeDefined();
  });
});

describe("GET /api/tokens/:symbol/impact", () => {
  it("returns 404 for unknown token", async () => {
    const { app } = createApp();
    const res = await request(app).get("/api/tokens/xyz/impact");
    expect(res.status).toBe(404);
  });

  it("returns empty impact stats when no data", async () => {
    const { app, priceRepo } = createApp();
    seedToken(priceRepo);
    const res = await request(app).get("/api/tokens/btc/impact");
    expect(res.status).toBe(200);
    expect(res.body.data.symbol).toBe("BTC");
    expect(res.body.data.categories).toEqual([]);
    expect(res.body.data.totalEvents).toBe(0);
  });

  it("returns impact stats grouped by category", async () => {
    const { app, priceRepo, newsRepo, impactRepo } = createApp();
    seedToken(priceRepo);

    // Insert articles and impact events
    newsRepo.insertArticle(sampleArticle);
    newsRepo.insertArticle({
      ...sampleArticle,
      guid: "art-2",
      title: "Another ETF Filing",
      url: "https://example.com/2",
    });
    newsRepo.insertArticle({
      ...sampleArticle,
      guid: "art-3",
      title: "Bitcoin hack on exchange",
      url: "https://example.com/3",
    });

    const a1 = newsRepo.getArticleByGuid("art-1")!;
    const a2 = newsRepo.getArticleByGuid("art-2")!;
    const a3 = newsRepo.getArticleByGuid("art-3")!;

    impactRepo.upsertImpactEventsBatch([
      {
        articleId: a1.id,
        tokenSymbol: "btc",
        category: "etf",
        priceAtEvent: 85000,
        price1h: 85500,
        price4h: 86000,
        price24h: 87000,
        change1h: 0.59,
        change4h: 1.18,
        change24h: 2.35,
        sampleSize: 0,
        avgChange1h: null,
        avgChange4h: null,
        avgChange24h: null,
        confidenceScore: 0,
      },
      {
        articleId: a2.id,
        tokenSymbol: "btc",
        category: "etf",
        priceAtEvent: 86000,
        price1h: 86300,
        price4h: 86700,
        price24h: 87200,
        change1h: 0.35,
        change4h: 0.81,
        change24h: 1.4,
        sampleSize: 0,
        avgChange1h: null,
        avgChange4h: null,
        avgChange24h: null,
        confidenceScore: 0,
      },
      {
        articleId: a3.id,
        tokenSymbol: "btc",
        category: "hack_exploit",
        priceAtEvent: 85000,
        price1h: 84000,
        price4h: 83000,
        price24h: 82000,
        change1h: -1.18,
        change4h: -2.35,
        change24h: -3.53,
        sampleSize: 0,
        avgChange1h: null,
        avgChange4h: null,
        avgChange24h: null,
        confidenceScore: 0,
      },
    ]);

    const res = await request(app).get("/api/tokens/btc/impact");
    expect(res.status).toBe(200);
    expect(res.body.data.categories).toHaveLength(2);
    expect(res.body.data.totalEvents).toBe(3);

    // ETF category should have 2 events
    const etf = res.body.data.categories.find(
      (c: { category: string }) => c.category === "etf"
    );
    expect(etf).toBeDefined();
    expect(etf.sampleSize).toBe(2);
    expect(etf.avgChange24h).toBeCloseTo(1.875, 1);

    // Hack category should have 1 event
    const hack = res.body.data.categories.find(
      (c: { category: string }) => c.category === "hack_exploit"
    );
    expect(hack).toBeDefined();
    expect(hack.sampleSize).toBe(1);
    expect(hack.avgChange24h).toBeCloseTo(-3.53, 1);
  });
});

describe("GET /api/tokens/:symbol/summary", () => {
  it("returns 404 for unknown token", async () => {
    const { app } = createApp();
    const res = await request(app).get("/api/tokens/xyz/summary");
    expect(res.status).toBe(404);
  });

  it("returns null data when no articles exist", async () => {
    const { app, priceRepo } = createApp();
    seedToken(priceRepo);
    const res = await request(app).get("/api/tokens/btc/summary");
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect(res.body.message).toBeDefined();
  });

  it("generates English fallback summary when articles exist", async () => {
    const { app, priceRepo, newsRepo, impactRepo } = createApp();
    seedToken(priceRepo);

    newsRepo.insertArticle(sampleArticle);
    const a1 = newsRepo.getArticleByGuid("art-1")!;

    // Classify the article
    impactRepo.upsertCategory({
      articleId: a1.id,
      category: "etf",
      confidence: 0.8,
    });

    const res = await request(app).get("/api/tokens/btc/summary");
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.symbol).toBe("BTC");
    expect(res.body.data.lang).toBe("en");
    expect(res.body.data.summary).toContain("BTC");
    expect(res.body.data.sentimentBreakdown).toBeDefined();
    expect(res.body.data.netImpact).toBeDefined();
    expect(res.body.data.keyEvents).toHaveLength(1);
  });

  it("generates Chinese fallback summary with lang=zh", async () => {
    const { app, priceRepo, newsRepo, impactRepo } = createApp();
    seedToken(priceRepo);

    newsRepo.insertArticle(sampleArticle);
    const a1 = newsRepo.getArticleByGuid("art-1")!;
    impactRepo.upsertCategory({
      articleId: a1.id,
      category: "etf",
      confidence: 0.8,
    });

    const res = await request(app).get("/api/tokens/btc/summary?lang=zh");
    expect(res.status).toBe(200);
    expect(res.body.data.lang).toBe("zh");
    expect(res.body.data.summary).toContain("BTC");
    expect(res.body.data.summary).toContain("ETF");
  });

  it("returns cached summary on second request", async () => {
    const { app, priceRepo, newsRepo, impactRepo } = createApp();
    seedToken(priceRepo);

    newsRepo.insertArticle(sampleArticle);
    const a1 = newsRepo.getArticleByGuid("art-1")!;
    impactRepo.upsertCategory({
      articleId: a1.id,
      category: "etf",
      confidence: 0.8,
    });

    // First request generates
    const res1 = await request(app).get("/api/tokens/btc/summary");
    expect(res1.status).toBe(200);
    const generatedAt1 = res1.body.data.generatedAt;

    // Second request should return cached
    const res2 = await request(app).get("/api/tokens/btc/summary");
    expect(res2.status).toBe(200);
    expect(res2.body.data.generatedAt).toBe(generatedAt1);
  });
});
