import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase } from "../db/database.js";
import { DigestGenerator } from "./digest-generator.js";
import type Database from "better-sqlite3";

describe("DigestGenerator", () => {
  let db: Database.Database;
  let generator: DigestGenerator;

  beforeEach(() => {
    db = createTestDatabase();
    // No API key → fallback path
    generator = new DigestGenerator(db, "");

    // Seed some test data
    db.prepare(
      "INSERT INTO tokens (id, symbol, name) VALUES (?, ?, ?)"
    ).run("bitcoin", "btc", "Bitcoin");
    db.prepare(
      "INSERT INTO tokens (id, symbol, name) VALUES (?, ?, ?)"
    ).run("ethereum", "eth", "Ethereum");

    db.prepare(
      `INSERT INTO prices (token_id, price_usd, market_cap, total_volume, price_change_24h, price_change_percentage_24h, circulating_supply)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("bitcoin", 65000, 1200000000000, 30000000000, 1500, 2.35, 19000000);
    db.prepare(
      `INSERT INTO prices (token_id, price_usd, market_cap, total_volume, price_change_24h, price_change_percentage_24h, circulating_supply)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("ethereum", 3500, 420000000000, 15000000000, -80, -2.23, 120000000);

    // Seed articles
    db.prepare(
      `INSERT INTO articles (guid, title, summary, url, source, published_at, relevance_score, token_tags)
       VALUES (?, ?, ?, ?, ?, datetime('now', '-2 hours'), 80, ?)`
    ).run("guid1", "SEC approves new BTC ETF", "Summary", "https://example.com/1", "CoinDesk", '["BTC"]');

    db.prepare(
      `INSERT INTO articles (guid, title, summary, url, source, published_at, relevance_score, token_tags)
       VALUES (?, ?, ?, ?, ?, datetime('now', '-5 hours'), 60, ?)`
    ).run("guid2", "Ethereum Shanghai upgrade complete", "Summary", "https://example.com/2", "The Block", '["ETH"]');

    // Classify articles
    db.prepare(
      "INSERT INTO news_categories (article_id, category, confidence) VALUES (1, 'etf', 0.95)"
    ).run();
    db.prepare(
      "INSERT INTO news_categories (article_id, category, confidence) VALUES (2, 'technology', 0.88)"
    ).run();
  });

  it("generates English digest with fallback", async () => {
    const digest = await generator.generate("en");

    expect(digest.lang).toBe("en");
    expect(digest.subject).toContain("Wavedge Daily Crypto Intelligence");
    expect(digest.bodyHtml).toContain("BTC");
    expect(digest.bodyTelegram).toContain("Wavedge Daily Crypto Intelligence");
    expect(digest.generatedAt).toBeTruthy();
  });

  it("generates Chinese digest with fallback", async () => {
    const digest = await generator.generate("zh");

    expect(digest.lang).toBe("zh");
    expect(digest.subject).toContain("每日加密情報");
    expect(digest.bodyTelegram).toContain("每日加密情報");
  });

  it("generates digest with no data gracefully", async () => {
    const emptyDb = createTestDatabase();
    const emptyGen = new DigestGenerator(emptyDb, "");
    const digest = await emptyGen.generate("en");

    expect(digest.lang).toBe("en");
    expect(digest.bodyHtml).toBeTruthy();
    expect(digest.bodyTelegram).toBeTruthy();
  });

  it("includes top movers in HTML output", async () => {
    const digest = await generator.generate("en");
    expect(digest.bodyHtml).toContain("65,000");
    expect(digest.bodyHtml).toContain("2.35");
  });

  it("includes article titles in output", async () => {
    const digest = await generator.generate("en");
    expect(digest.bodyTelegram).toContain("SEC approves new BTC ETF");
  });
});
