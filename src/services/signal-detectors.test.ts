import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase } from "../db/database.js";
import { NewsRepository } from "../db/news-repository.js";
import { PriceRepository } from "../db/price-repository.js";
import { detectNewsFrequency, detectPriceMovement, detectVolumeChange } from "./signal-detectors.js";
import type Database from "better-sqlite3";

describe("Signal Detectors", () => {
  let db: Database.Database;
  let newsRepo: NewsRepository;
  let priceRepo: PriceRepository;

  beforeEach(() => {
    db = createTestDatabase();
    newsRepo = new NewsRepository(db);
    priceRepo = new PriceRepository(db);
  });

  describe("detectNewsFrequency", () => {
    it("returns null when below threshold", () => {
      newsRepo.insertArticle({
        guid: "a1",
        title: "BTC news",
        summary: null,
        url: "https://example.com/1",
        source: "coindesk",
        author: null,
        publishedAt: new Date().toISOString(),
        relevanceScore: 50,
        tokenTags: ["BTC"],
      });

      const signal = detectNewsFrequency("BTC", 60, 3, db);
      expect(signal).toBeNull();
    });

    it("returns signal when at threshold", () => {
      const now = new Date().toISOString();
      for (let i = 0; i < 3; i++) {
        newsRepo.insertArticle({
          guid: `a${i}`,
          title: `BTC news ${i}`,
          summary: null,
          url: `https://example.com/${i}`,
          source: "coindesk",
          author: null,
          publishedAt: now,
          relevanceScore: 50,
          tokenTags: ["BTC"],
        });
      }

      const signal = detectNewsFrequency("BTC", 60, 3, db);
      expect(signal).not.toBeNull();
      expect(signal!.type).toBe("news_frequency");
      expect(signal!.value).toBe(3);
      expect(signal!.tokenSymbol).toBe("BTC");
    });

    it("filters by token symbol", () => {
      const now = new Date().toISOString();
      for (let i = 0; i < 3; i++) {
        newsRepo.insertArticle({
          guid: `a${i}`,
          title: `ETH news ${i}`,
          summary: null,
          url: `https://example.com/${i}`,
          source: "coindesk",
          author: null,
          publishedAt: now,
          relevanceScore: 50,
          tokenTags: ["ETH"],
        });
      }

      expect(detectNewsFrequency("BTC", 60, 3, db)).toBeNull();
      expect(detectNewsFrequency("ETH", 60, 3, db)).not.toBeNull();
    });
  });

  describe("detectPriceMovement", () => {
    it("returns null when no price data", () => {
      const signal = detectPriceMovement("BTC", 5, 60, db);
      expect(signal).toBeNull();
    });

    it("returns null when price change below threshold", () => {
      priceRepo.upsertToken("bitcoin", "btc", "Bitcoin");
      db.prepare(
        `INSERT INTO prices (token_id, price_usd, fetched_at) VALUES (?, ?, datetime('now', '-65 minutes'))`
      ).run("bitcoin", 80000);
      db.prepare(
        `INSERT INTO prices (token_id, price_usd, fetched_at) VALUES (?, ?, datetime('now'))`
      ).run("bitcoin", 80800); // 1% change, below 5%

      const signal = detectPriceMovement("btc", 5, 60, db);
      expect(signal).toBeNull();
    });

    it("returns signal when price change exceeds threshold", () => {
      priceRepo.upsertToken("bitcoin", "btc", "Bitcoin");
      db.prepare(
        `INSERT INTO prices (token_id, price_usd, fetched_at) VALUES (?, ?, datetime('now', '-65 minutes'))`
      ).run("bitcoin", 80000);
      db.prepare(
        `INSERT INTO prices (token_id, price_usd, fetched_at) VALUES (?, ?, datetime('now'))`
      ).run("bitcoin", 84500); // +5.625%

      const signal = detectPriceMovement("btc", 5, 60, db);
      expect(signal).not.toBeNull();
      expect(signal!.type).toBe("price_movement");
      expect(signal!.value).toBeCloseTo(5.625, 1);
    });
  });

  describe("detectVolumeChange", () => {
    it("returns null when insufficient data", () => {
      const signal = detectVolumeChange("BTC", 100, db);
      expect(signal).toBeNull();
    });

    it("returns null when volume change below threshold", () => {
      priceRepo.upsertToken("bitcoin", "btc", "Bitcoin");
      db.prepare(
        `INSERT INTO prices (token_id, price_usd, total_volume, fetched_at) VALUES (?, ?, ?, datetime('now', '-10 minutes'))`
      ).run("bitcoin", 80000, 1000000);
      db.prepare(
        `INSERT INTO prices (token_id, price_usd, total_volume, fetched_at) VALUES (?, ?, ?, datetime('now'))`
      ).run("bitcoin", 80100, 1050000); // +5%, below 100% threshold

      const signal = detectVolumeChange("btc", 100, db);
      expect(signal).toBeNull();
    });

    it("returns signal when volume change exceeds threshold", () => {
      priceRepo.upsertToken("bitcoin", "btc", "Bitcoin");
      db.prepare(
        `INSERT INTO prices (token_id, price_usd, total_volume, fetched_at) VALUES (?, ?, ?, datetime('now', '-10 minutes'))`
      ).run("bitcoin", 80000, 1000000);
      db.prepare(
        `INSERT INTO prices (token_id, price_usd, total_volume, fetched_at) VALUES (?, ?, ?, datetime('now'))`
      ).run("bitcoin", 80100, 2500000); // +150%

      const signal = detectVolumeChange("btc", 100, db);
      expect(signal).not.toBeNull();
      expect(signal!.type).toBe("volume_change");
      expect(signal!.value).toBeCloseTo(150, 0);
    });
  });
});
