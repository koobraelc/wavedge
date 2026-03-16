import { describe, it, expect, beforeEach } from "vitest";
import { SocialRepository } from "./social-repository.js";
import { createTestDatabase } from "./database.js";
import type Database from "better-sqlite3";

let db: Database.Database;
let repo: SocialRepository;

beforeEach(() => {
  db = createTestDatabase();
  repo = new SocialRepository(db);
});

describe("SocialRepository", () => {
  const baseMention = {
    tokenSymbol: "BTC",
    source: "twitter",
    mentionCount: 1500,
    sentimentScore: 0.4,
    sentimentLabel: "bullish",
    positiveCount: 800,
    negativeCount: 200,
    neutralCount: 500,
    sampleTexts: ["Bitcoin is pumping!", "BTC to the moon"],
  };

  it("should insert and retrieve a mention", () => {
    repo.insertMention(baseMention);
    const latest = repo.getLatest("BTC");
    expect(latest).toBeDefined();
    expect(latest!.mention_count).toBe(1500);
    expect(latest!.sentiment_score).toBeCloseTo(0.4);
    expect(latest!.sentiment_label).toBe("bullish");
    expect(JSON.parse(latest!.sample_texts)).toHaveLength(2);
  });

  it("should insert batch", () => {
    const count = repo.insertBatch([
      baseMention,
      { ...baseMention, tokenSymbol: "ETH", mentionCount: 800, sentimentScore: -0.3, sentimentLabel: "bearish" },
    ]);
    expect(count).toBe(2);

    const all = repo.getLatestAll();
    expect(all).toHaveLength(2);
  });

  it("should get history", () => {
    repo.insertMention(baseMention);
    const history = repo.getHistory("BTC", 24);
    expect(history).toHaveLength(1);
    expect(history[0].mention_count).toBe(1500);
  });

  it("should compute mention change", () => {
    // Insert two data points with different timestamps
    db.prepare(
      `INSERT INTO social_mentions (token_symbol, source, mention_count, sentiment_score, sentiment_label, positive_count, negative_count, neutral_count, sample_texts, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 hour'))`
    ).run("BTC", "twitter", 1000, 0.2, "neutral", 400, 200, 400, "[]");

    db.prepare(
      `INSERT INTO social_mentions (token_symbol, source, mention_count, sentiment_score, sentiment_label, positive_count, negative_count, neutral_count, sample_texts, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run("BTC", "twitter", 1500, 0.4, "bullish", 800, 200, 500, "[]");

    const change = repo.getMentionChange("BTC");
    expect(change).not.toBeNull();
    expect(change!.current).toBe(1500);
    expect(change!.previous).toBe(1000);
    expect(change!.changePercent).toBe(50);
  });

  it("should handle case-insensitive symbol lookup", () => {
    repo.insertMention(baseMention);
    const latest = repo.getLatest("btc");
    expect(latest).toBeDefined();
    expect(latest!.token_symbol).toBe("BTC");
  });

  it("should return undefined for unknown token", () => {
    const latest = repo.getLatest("DOESNOTEXIST");
    expect(latest).toBeUndefined();
  });

  it("should return null for no mention change data", () => {
    const change = repo.getMentionChange("BTC");
    expect(change).toBeNull();
  });
});
