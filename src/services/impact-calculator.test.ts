import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase } from "../db/database.js";
import { ImpactRepository } from "../db/impact-repository.js";
import { NewsRepository, type ArticleInsert } from "../db/news-repository.js";
import { PriceRepository } from "../db/price-repository.js";
import { ImpactCalculator, computeConfidence } from "./impact-calculator.js";
import { NewsClassifier } from "./news-classifier.js";
import type Database from "better-sqlite3";

function makeArticleInsert(overrides?: Partial<ArticleInsert>): ArticleInsert {
  return {
    guid: "https://example.com/article-1",
    title: "SEC Approves Bitcoin ETF Application",
    summary: "A major regulatory approval for Bitcoin.",
    url: "https://example.com/article-1",
    source: "coindesk",
    author: "Jane Doe",
    publishedAt: "2026-03-15T12:00:00.000Z",
    relevanceScore: 75,
    tokenTags: ["btc"],
    ...overrides,
  };
}

describe("computeConfidence", () => {
  it("should return 0 for no samples", () => {
    expect(computeConfidence(0)).toBe(0);
  });

  it("should return low confidence for few samples", () => {
    expect(computeConfidence(2)).toBe(0.1);
    expect(computeConfidence(4)).toBe(0.25);
  });

  it("should return higher confidence for more samples", () => {
    expect(computeConfidence(10)).toBe(0.6);
    expect(computeConfidence(20)).toBe(0.75);
    expect(computeConfidence(50)).toBe(0.9);
    expect(computeConfidence(100)).toBe(0.9);
  });
});

describe("ImpactCalculator", () => {
  let db: Database.Database;
  let impactRepo: ImpactRepository;
  let newsRepo: NewsRepository;
  let classifier: NewsClassifier;
  let calculator: ImpactCalculator;

  beforeEach(() => {
    db = createTestDatabase();
    impactRepo = new ImpactRepository(db);
    newsRepo = new NewsRepository(db);
    classifier = new NewsClassifier(); // keyword-only fallback
    calculator = new ImpactCalculator(impactRepo, newsRepo, classifier);
  });

  describe("getArticleImpact", () => {
    it("should return null for non-existent article", async () => {
      const result = await calculator.getArticleImpact(999);
      expect(result).toBeNull();
    });

    it("should classify and return impact for an article", async () => {
      newsRepo.insertArticle(makeArticleInsert());
      const article = newsRepo.getArticleByGuid("https://example.com/article-1")!;

      const impact = await calculator.getArticleImpact(article.id);

      expect(impact).not.toBeNull();
      expect(impact!.articleId).toBe(article.id);
      expect(impact!.category).toBe("etf"); // "SEC Approves Bitcoin ETF Application" → etf
      expect(impact!.categoryConfidence).toBeGreaterThan(0);
      expect(impact!.tokenImpacts).toHaveLength(1);
      expect(impact!.tokenImpacts[0].tokenSymbol).toBe("btc");
    });

    it("should use cached classification on second call", async () => {
      newsRepo.insertArticle(makeArticleInsert());
      const article = newsRepo.getArticleByGuid("https://example.com/article-1")!;

      await calculator.getArticleImpact(article.id);

      // Category should be stored now
      const cat = impactRepo.getCategoryByArticleId(article.id);
      expect(cat).toBeDefined();
      expect(cat!.category).toBe("etf");

      // Second call should use cached category
      const impact2 = await calculator.getArticleImpact(article.id);
      expect(impact2!.category).toBe("etf");
    });

    it("should include historical data when available", async () => {
      // Create articles with known impact events
      newsRepo.insertArticlesBatch([
        makeArticleInsert({ guid: "a1" }),
        makeArticleInsert({ guid: "a2" }),
        makeArticleInsert({ guid: "target", title: "New ETF Filing Submitted" }),
      ]);
      const a1 = newsRepo.getArticleByGuid("a1")!;
      const a2 = newsRepo.getArticleByGuid("a2")!;
      const target = newsRepo.getArticleByGuid("target")!;

      // Add historical impact events for "etf" category
      impactRepo.upsertImpactEventsBatch([
        {
          articleId: a1.id, tokenSymbol: "btc", category: "etf",
          priceAtEvent: 85000, price1h: 85500, price4h: 86000, price24h: 87000,
          change1h: 0.59, change4h: 1.18, change24h: 2.35,
          sampleSize: 0, avgChange1h: null, avgChange4h: null, avgChange24h: null,
          confidenceScore: 0,
        },
        {
          articleId: a2.id, tokenSymbol: "btc", category: "etf",
          priceAtEvent: 86000, price1h: 86200, price4h: 86500, price24h: 86800,
          change1h: 0.23, change4h: 0.58, change24h: 0.93,
          sampleSize: 0, avgChange1h: null, avgChange4h: null, avgChange24h: null,
          confidenceScore: 0,
        },
      ]);

      const impact = await calculator.getArticleImpact(target.id);
      expect(impact!.tokenImpacts[0].historical.sampleSize).toBe(2);
      expect(impact!.tokenImpacts[0].historical.avgChange24h).toBeCloseTo(1.64, 1);
      expect(impact!.tokenImpacts[0].historical.confidenceScore).toBe(0.1);
    });
  });

  describe("classifyNewArticles", () => {
    it("should classify unclassified articles", async () => {
      newsRepo.insertArticlesBatch([
        makeArticleInsert({ guid: "a1", title: "Bitcoin ETF Approved", summary: null }),
        makeArticleInsert({ guid: "a2", title: "Major Hack on DeFi Protocol", summary: null }),
        makeArticleInsert({ guid: "a3", title: "SEC Regulation Update", summary: null }),
      ]);

      const count = await calculator.classifyNewArticles();
      expect(count).toBe(3);

      // Verify categories
      const a1 = newsRepo.getArticleByGuid("a1")!;
      const a2 = newsRepo.getArticleByGuid("a2")!;
      const a3 = newsRepo.getArticleByGuid("a3")!;

      expect(impactRepo.getCategoryByArticleId(a1.id)!.category).toBe("etf");
      expect(impactRepo.getCategoryByArticleId(a2.id)!.category).toBe("hack_exploit");
      expect(impactRepo.getCategoryByArticleId(a3.id)!.category).toBe("regulatory");
    });

    it("should skip already classified articles", async () => {
      newsRepo.insertArticle(makeArticleInsert());
      const article = newsRepo.getArticleByGuid("https://example.com/article-1")!;

      impactRepo.upsertCategory({
        articleId: article.id,
        category: "market",
        confidence: 0.9,
      });

      const count = await calculator.classifyNewArticles();
      expect(count).toBe(0);
    });
  });

  describe("computeImpactEvents", () => {
    let priceRepo: PriceRepository;
    let calcWithPrices: ImpactCalculator;

    beforeEach(() => {
      priceRepo = new PriceRepository(db);
      calcWithPrices = new ImpactCalculator(impactRepo, newsRepo, classifier, priceRepo);
    });

    it("should throw if no PriceRepository provided", () => {
      expect(() => calculator.computeImpactEvents()).toThrow(
        "PriceRepository required"
      );
    });

    it("should compute impact events for classified articles with price data", () => {
      // Insert an article published 48 hours ago
      const publishedAt = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      newsRepo.insertArticle(
        makeArticleInsert({
          guid: "impact-test-1",
          title: "SEC Approves Bitcoin ETF",
          publishedAt,
          tokenTags: ["BTC"],
        })
      );
      const article = newsRepo.getArticleByGuid("impact-test-1")!;

      // Classify the article
      impactRepo.upsertCategory({
        articleId: article.id,
        category: "etf",
        confidence: 0.9,
      });

      // Insert token and price data at various timestamps
      priceRepo.upsertToken("bitcoin", "btc", "Bitcoin");

      // Format timestamps for SQLite (YYYY-MM-DD HH:MM:SS)
      const formatForSqlite = (iso: string) =>
        iso.replace("T", " ").replace("Z", "").slice(0, 19);

      const baseTime = new Date(publishedAt);
      const t0 = formatForSqlite(baseTime.toISOString());
      const t1h = formatForSqlite(
        new Date(baseTime.getTime() + 1 * 3600 * 1000).toISOString()
      );
      const t4h = formatForSqlite(
        new Date(baseTime.getTime() + 4 * 3600 * 1000).toISOString()
      );
      const t24h = formatForSqlite(
        new Date(baseTime.getTime() + 24 * 3600 * 1000).toISOString()
      );

      // Insert prices directly
      db.prepare(
        `INSERT INTO prices (token_id, price_usd, fetched_at) VALUES (?, ?, ?)`
      ).run("bitcoin", 85000, t0);
      db.prepare(
        `INSERT INTO prices (token_id, price_usd, fetched_at) VALUES (?, ?, ?)`
      ).run("bitcoin", 85500, t1h);
      db.prepare(
        `INSERT INTO prices (token_id, price_usd, fetched_at) VALUES (?, ?, ?)`
      ).run("bitcoin", 86000, t4h);
      db.prepare(
        `INSERT INTO prices (token_id, price_usd, fetched_at) VALUES (?, ?, ?)`
      ).run("bitcoin", 87000, t24h);

      const count = calcWithPrices.computeImpactEvents();

      expect(count).toBe(1);

      const events = impactRepo.getImpactByArticleId(article.id);
      expect(events).toHaveLength(1);
      expect(events[0].token_symbol).toBe("BTC");
      expect(events[0].price_at_event).toBe(85000);
      expect(events[0].price_1h).toBe(85500);
      expect(events[0].price_4h).toBe(86000);
      expect(events[0].price_24h).toBe(87000);
      expect(events[0].change_1h).toBeCloseTo(0.588, 1);
      expect(events[0].change_4h).toBeCloseTo(1.176, 1);
      expect(events[0].change_24h).toBeCloseTo(2.353, 1);
    });

    it("should skip articles without price data", () => {
      const publishedAt = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      newsRepo.insertArticle(
        makeArticleInsert({
          guid: "no-price-test",
          publishedAt,
          tokenTags: ["XYZ"],
        })
      );
      const article = newsRepo.getArticleByGuid("no-price-test")!;

      impactRepo.upsertCategory({
        articleId: article.id,
        category: "market",
        confidence: 0.8,
      });

      const count = calcWithPrices.computeImpactEvents();
      expect(count).toBe(0);
    });

    it("should not recompute existing impact events", () => {
      const publishedAt = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      newsRepo.insertArticle(
        makeArticleInsert({
          guid: "already-computed",
          publishedAt,
          tokenTags: ["BTC"],
        })
      );
      const article = newsRepo.getArticleByGuid("already-computed")!;

      impactRepo.upsertCategory({
        articleId: article.id,
        category: "etf",
        confidence: 0.9,
      });

      // Pre-insert an impact event
      impactRepo.upsertImpactEvent({
        articleId: article.id,
        tokenSymbol: "BTC",
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
      });

      const count = calcWithPrices.computeImpactEvents();
      expect(count).toBe(0);
    });
  });
});
