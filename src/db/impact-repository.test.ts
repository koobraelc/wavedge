import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase } from "./database.js";
import { ImpactRepository } from "./impact-repository.js";
import { NewsRepository, type ArticleInsert } from "./news-repository.js";
import type Database from "better-sqlite3";

function makeArticleInsert(overrides?: Partial<ArticleInsert>): ArticleInsert {
  return {
    guid: "https://example.com/article-1",
    title: "SEC Approves Bitcoin ETF",
    summary: "The SEC has approved a spot Bitcoin ETF.",
    url: "https://example.com/article-1",
    source: "coindesk",
    author: "Jane Doe",
    publishedAt: "2026-03-15T12:00:00.000Z",
    relevanceScore: 75,
    tokenTags: ["btc"],
    ...overrides,
  };
}

describe("ImpactRepository", () => {
  let db: Database.Database;
  let impactRepo: ImpactRepository;
  let newsRepo: NewsRepository;

  beforeEach(() => {
    db = createTestDatabase();
    impactRepo = new ImpactRepository(db);
    newsRepo = new NewsRepository(db);
  });

  describe("upsertCategory", () => {
    it("should insert a category for an article", () => {
      newsRepo.insertArticle(makeArticleInsert());
      const article = newsRepo.getArticleByGuid("https://example.com/article-1");

      impactRepo.upsertCategory({
        articleId: article!.id,
        category: "regulatory",
        confidence: 0.85,
      });

      const cat = impactRepo.getCategoryByArticleId(article!.id);
      expect(cat).toBeDefined();
      expect(cat!.category).toBe("regulatory");
      expect(cat!.confidence).toBe(0.85);
    });

    it("should update on conflict", () => {
      newsRepo.insertArticle(makeArticleInsert());
      const article = newsRepo.getArticleByGuid("https://example.com/article-1");

      impactRepo.upsertCategory({
        articleId: article!.id,
        category: "regulatory",
        confidence: 0.5,
      });

      impactRepo.upsertCategory({
        articleId: article!.id,
        category: "etf",
        confidence: 0.9,
      });

      const cat = impactRepo.getCategoryByArticleId(article!.id);
      expect(cat!.category).toBe("etf");
      expect(cat!.confidence).toBe(0.9);
    });
  });

  describe("upsertCategoriesBatch", () => {
    it("should insert multiple categories", () => {
      newsRepo.insertArticlesBatch([
        makeArticleInsert({ guid: "a1" }),
        makeArticleInsert({ guid: "a2" }),
      ]);
      const a1 = newsRepo.getArticleByGuid("a1")!;
      const a2 = newsRepo.getArticleByGuid("a2")!;

      const count = impactRepo.upsertCategoriesBatch([
        { articleId: a1.id, category: "regulatory", confidence: 0.8 },
        { articleId: a2.id, category: "market", confidence: 0.6 },
      ]);

      expect(count).toBe(2);
      expect(impactRepo.getCategoryByArticleId(a1.id)!.category).toBe("regulatory");
      expect(impactRepo.getCategoryByArticleId(a2.id)!.category).toBe("market");
    });
  });

  describe("impact events", () => {
    it("should insert and retrieve impact events", () => {
      newsRepo.insertArticle(makeArticleInsert());
      const article = newsRepo.getArticleByGuid("https://example.com/article-1")!;

      impactRepo.upsertImpactEvent({
        articleId: article.id,
        tokenSymbol: "btc",
        category: "regulatory",
        priceAtEvent: 85000,
        price1h: 84500,
        price4h: 84000,
        price24h: 83000,
        change1h: -0.59,
        change4h: -1.18,
        change24h: -2.35,
        sampleSize: 15,
        avgChange1h: -0.2,
        avgChange4h: -0.45,
        avgChange24h: -0.45,
        confidenceScore: 0.6,
      });

      const events = impactRepo.getImpactByArticleId(article.id);
      expect(events).toHaveLength(1);
      expect(events[0].token_symbol).toBe("btc");
      expect(events[0].price_at_event).toBe(85000);
      expect(events[0].change_24h).toBe(-2.35);
    });

    it("should update on conflict (same article + token)", () => {
      newsRepo.insertArticle(makeArticleInsert());
      const article = newsRepo.getArticleByGuid("https://example.com/article-1")!;

      impactRepo.upsertImpactEvent({
        articleId: article.id,
        tokenSymbol: "btc",
        category: "regulatory",
        priceAtEvent: 85000,
        price1h: null,
        price4h: null,
        price24h: null,
        change1h: null,
        change4h: null,
        change24h: null,
        sampleSize: 0,
        avgChange1h: null,
        avgChange4h: null,
        avgChange24h: null,
        confidenceScore: 0,
      });

      impactRepo.upsertImpactEvent({
        articleId: article.id,
        tokenSymbol: "btc",
        category: "regulatory",
        priceAtEvent: 85000,
        price1h: 84500,
        price4h: 84000,
        price24h: 83000,
        change1h: -0.59,
        change4h: -1.18,
        change24h: -2.35,
        sampleSize: 15,
        avgChange1h: -0.2,
        avgChange4h: -0.45,
        avgChange24h: -0.45,
        confidenceScore: 0.6,
      });

      const events = impactRepo.getImpactByArticleId(article.id);
      expect(events).toHaveLength(1);
      expect(events[0].change_24h).toBe(-2.35);
    });
  });

  describe("getHistoricalImpact", () => {
    it("should aggregate historical impact by category and token", () => {
      newsRepo.insertArticlesBatch([
        makeArticleInsert({ guid: "a1" }),
        makeArticleInsert({ guid: "a2" }),
        makeArticleInsert({ guid: "a3" }),
      ]);
      const a1 = newsRepo.getArticleByGuid("a1")!;
      const a2 = newsRepo.getArticleByGuid("a2")!;
      const a3 = newsRepo.getArticleByGuid("a3")!;

      impactRepo.upsertImpactEventsBatch([
        {
          articleId: a1.id, tokenSymbol: "btc", category: "regulatory",
          priceAtEvent: 85000, price1h: 84500, price4h: 84000, price24h: 83000,
          change1h: -0.59, change4h: -1.18, change24h: -2.35,
          sampleSize: 0, avgChange1h: null, avgChange4h: null, avgChange24h: null,
          confidenceScore: 0,
        },
        {
          articleId: a2.id, tokenSymbol: "btc", category: "regulatory",
          priceAtEvent: 86000, price1h: 85800, price4h: 85600, price24h: 85400,
          change1h: -0.23, change4h: -0.47, change24h: -0.70,
          sampleSize: 0, avgChange1h: null, avgChange4h: null, avgChange24h: null,
          confidenceScore: 0,
        },
        {
          articleId: a3.id, tokenSymbol: "btc", category: "etf",
          priceAtEvent: 87000, price1h: 87500, price4h: 88000, price24h: 89000,
          change1h: 0.57, change4h: 1.15, change24h: 2.30,
          sampleSize: 0, avgChange1h: null, avgChange4h: null, avgChange24h: null,
          confidenceScore: 0,
        },
      ]);

      const regImpact = impactRepo.getHistoricalImpact("regulatory", "btc");
      expect(regImpact.sampleSize).toBe(2);
      expect(regImpact.avgChange24h).toBeCloseTo(-1.525, 2);

      const etfImpact = impactRepo.getHistoricalImpact("etf", "btc");
      expect(etfImpact.sampleSize).toBe(1);
      expect(etfImpact.avgChange24h).toBeCloseTo(2.30, 2);
    });

    it("should return zero sample size for unknown categories", () => {
      const impact = impactRepo.getHistoricalImpact("unknown", "btc");
      expect(impact.sampleSize).toBe(0);
      expect(impact.avgChange24h).toBeNull();
    });
  });

  describe("getUncategorizedArticleIds", () => {
    it("should return articles without categories", () => {
      newsRepo.insertArticlesBatch([
        makeArticleInsert({ guid: "a1" }),
        makeArticleInsert({ guid: "a2" }),
      ]);
      const a1 = newsRepo.getArticleByGuid("a1")!;

      impactRepo.upsertCategory({
        articleId: a1.id,
        category: "regulatory",
        confidence: 0.8,
      });

      const uncategorized = impactRepo.getUncategorizedArticleIds();
      expect(uncategorized).toHaveLength(1);
    });
  });
});
