import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createTestDatabase } from "../db/database.js";
import { NewsRepository } from "../db/news-repository.js";
import { ImpactRepository } from "../db/impact-repository.js";
import { NewsClassifier } from "../services/news-classifier.js";
import { createNewsRouter } from "./news.js";

function createApp() {
  const db = createTestDatabase();
  const repo = new NewsRepository(db);
  const impactRepo = new ImpactRepository(db);
  const classifier = new NewsClassifier(); // keyword fallback
  const app = express();
  app.use(express.json());
  app.use("/api/news", createNewsRouter(repo, impactRepo, classifier));
  return { app, repo, impactRepo };
}

const sampleArticle = {
  guid: "https://example.com/article-1",
  title: "Bitcoin hits new high",
  summary: "BTC surged past $70k today",
  url: "https://example.com/article-1",
  source: "CoinDesk",
  author: "Alice",
  publishedAt: "2026-03-15T10:00:00Z",
  relevanceScore: 0.9,
  tokenTags: ["BTC"],
};

describe("GET /api/news", () => {
  it("returns empty array when no articles", async () => {
    const { app } = createApp();
    const res = await request(app).get("/api/news");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  it("returns articles with pagination", async () => {
    const { app, repo } = createApp();
    repo.insertArticle(sampleArticle);
    repo.insertArticle({ ...sampleArticle, guid: "art-2", title: "ETH update", url: "https://example.com/2" });

    const res = await request(app).get("/api/news?limit=1&offset=0");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.limit).toBe(1);
    expect(res.body.offset).toBe(0);
  });

  it("filters by source", async () => {
    const { app, repo } = createApp();
    repo.insertArticle(sampleArticle);
    repo.insertArticle({ ...sampleArticle, guid: "art-2", source: "CoinTelegraph", url: "https://example.com/2" });

    const res = await request(app).get("/api/news?source=CoinDesk");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0].source).toBe("CoinDesk");
  });

  it("filters by token tag", async () => {
    const { app, repo } = createApp();
    repo.insertArticle(sampleArticle);
    repo.insertArticle({ ...sampleArticle, guid: "art-2", tokenTags: ["ETH"], url: "https://example.com/2" });

    const res = await request(app).get("/api/news?token=ETH");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });
});

describe("GET /api/news/sources", () => {
  it("returns distinct sources", async () => {
    const { app, repo } = createApp();
    repo.insertArticle(sampleArticle);
    repo.insertArticle({ ...sampleArticle, guid: "art-2", source: "Decrypt", url: "https://example.com/2" });

    const res = await request(app).get("/api/news/sources");
    expect(res.status).toBe(200);
    expect(res.body.data).toContain("CoinDesk");
    expect(res.body.data).toContain("Decrypt");
  });
});

describe("GET /api/news/:id/impact", () => {
  it("returns 404 for non-existent article", async () => {
    const { app } = createApp();
    const res = await request(app).get("/api/news/999/impact");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Article not found");
  });

  it("returns 400 for invalid article ID", async () => {
    const { app } = createApp();
    const res = await request(app).get("/api/news/abc/impact");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid article ID");
  });

  it("returns impact data for an article", async () => {
    const { app, repo } = createApp();
    repo.insertArticle({
      ...sampleArticle,
      title: "SEC Approves Spot Bitcoin ETF",
      tokenTags: ["btc"],
    });
    const article = repo.getArticleByGuid(sampleArticle.guid)!;

    const res = await request(app).get(`/api/news/${article.id}/impact`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.articleId).toBe(article.id);
    expect(res.body.data.category).toBe("etf");
    expect(res.body.data.categoryConfidence).toBeGreaterThan(0);
    expect(res.body.data.tokenImpacts).toHaveLength(1);
    expect(res.body.data.tokenImpacts[0].tokenSymbol).toBe("btc");
    expect(res.body.data.tokenImpacts[0].historical).toBeDefined();
  });

  it("includes historical impact when data exists", async () => {
    const { app, repo, impactRepo } = createApp();

    // Add two articles with known impact data
    repo.insertArticle({ ...sampleArticle, guid: "hist-1", title: "ETF Filing Update" });
    repo.insertArticle({ ...sampleArticle, guid: "hist-2", title: "ETF Approved" });
    repo.insertArticle({ ...sampleArticle, guid: "target", title: "New ETF Filing", tokenTags: ["btc"] });

    const h1 = repo.getArticleByGuid("hist-1")!;
    const h2 = repo.getArticleByGuid("hist-2")!;
    const target = repo.getArticleByGuid("target")!;

    impactRepo.upsertImpactEventsBatch([
      {
        articleId: h1.id, tokenSymbol: "btc", category: "etf",
        priceAtEvent: 85000, price1h: 85500, price4h: 86000, price24h: 87000,
        change1h: 0.59, change4h: 1.18, change24h: 2.35,
        sampleSize: 0, avgChange1h: null, avgChange4h: null, avgChange24h: null,
        confidenceScore: 0,
      },
      {
        articleId: h2.id, tokenSymbol: "btc", category: "etf",
        priceAtEvent: 86000, price1h: 86300, price4h: 86700, price24h: 87200,
        change1h: 0.35, change4h: 0.81, change24h: 1.40,
        sampleSize: 0, avgChange1h: null, avgChange4h: null, avgChange24h: null,
        confidenceScore: 0,
      },
    ]);

    const res = await request(app).get(`/api/news/${target.id}/impact`);
    expect(res.status).toBe(200);
    const impact = res.body.data.tokenImpacts[0];
    expect(impact.historical.sampleSize).toBe(2);
    expect(impact.historical.avgChange24h).toBeCloseTo(1.875, 1);
    expect(impact.historical.confidenceScore).toBe(0.1);
  });
});
