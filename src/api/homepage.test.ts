import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createTestDatabase } from "../db/database.js";
import { createHomepageRouter } from "./homepage.js";
import type Database from "better-sqlite3";

function createApp(db?: Database.Database) {
  const testDb = db || createTestDatabase();
  const app = express();
  app.use(express.json());
  app.use("/api/homepage", createHomepageRouter(testDb));
  return { app, db: testDb };
}

function seedTokensAndPrices(db: Database.Database) {
  db.prepare(
    `INSERT INTO tokens (id, symbol, name) VALUES ('bitcoin', 'btc', 'Bitcoin')`
  ).run();
  db.prepare(
    `INSERT INTO tokens (id, symbol, name) VALUES ('ethereum', 'eth', 'Ethereum')`
  ).run();
  db.prepare(
    `INSERT INTO tokens (id, symbol, name) VALUES ('solana', 'sol', 'Solana')`
  ).run();

  db.prepare(
    `INSERT INTO prices (token_id, price_usd, market_cap, price_change_percentage_24h, fetched_at)
     VALUES ('bitcoin', 60000, 1e12, 2.5, datetime('now'))`
  ).run();
  db.prepare(
    `INSERT INTO prices (token_id, price_usd, market_cap, price_change_percentage_24h, fetched_at)
     VALUES ('ethereum', 3000, 3.5e11, -1.2, datetime('now'))`
  ).run();
  db.prepare(
    `INSERT INTO prices (token_id, price_usd, market_cap, price_change_percentage_24h, fetched_at)
     VALUES ('solana', 150, 6e10, 5.0, datetime('now'))`
  ).run();
}

function seedArticlesAndImpact(db: Database.Database) {
  // Bullish article (avg_change > 0.1)
  db.prepare(
    `INSERT INTO articles (guid, title, url, source, published_at, token_tags)
     VALUES ('a1', 'BTC surges', 'http://x.com/1', 'test', datetime('now', '-1 hour'), '["btc"]')`
  ).run();
  db.prepare(
    `INSERT INTO impact_events (article_id, token_symbol, category, change_24h, computed_at)
     VALUES (1, 'btc', 'market', 3.5, datetime('now'))`
  ).run();

  // Bearish article (avg_change < -0.1)
  db.prepare(
    `INSERT INTO articles (guid, title, url, source, published_at, token_tags)
     VALUES ('a2', 'ETH drops', 'http://x.com/2', 'test', datetime('now', '-2 hours'), '["eth"]')`
  ).run();
  db.prepare(
    `INSERT INTO impact_events (article_id, token_symbol, category, change_24h, computed_at)
     VALUES (2, 'eth', 'market', -2.0, datetime('now'))`
  ).run();

  // Neutral article (avg_change between -0.1 and 0.1)
  db.prepare(
    `INSERT INTO articles (guid, title, url, source, published_at, token_tags)
     VALUES ('a3', 'SOL steady', 'http://x.com/3', 'test', datetime('now', '-3 hours'), '["sol"]')`
  ).run();
  db.prepare(
    `INSERT INTO impact_events (article_id, token_symbol, category, change_24h, computed_at)
     VALUES (3, 'sol', 'market', 0.05, datetime('now'))`
  ).run();
}

describe("GET /api/homepage/sentiment", () => {
  it("returns zeros when no data", async () => {
    const { app } = createApp();
    const res = await request(app).get("/api/homepage/sentiment");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      bullish: 0,
      bearish: 0,
      neutral: 0,
      score: 0,
      label: "Neutral",
    });
  });

  it("computes sentiment from impact events", async () => {
    const db = createTestDatabase();
    seedArticlesAndImpact(db);
    const { app } = createApp(db);

    const res = await request(app).get("/api/homepage/sentiment");
    expect(res.status).toBe(200);
    expect(res.body.data.bullish).toBe(1);
    expect(res.body.data.bearish).toBe(1);
    expect(res.body.data.neutral).toBe(1);
    expect(res.body.data.score).toBe(0);
    expect(res.body.data.label).toBe("Neutral");
  });

  it("returns Bullish when mostly positive", async () => {
    const db = createTestDatabase();
    // Two bullish articles
    db.prepare(
      `INSERT INTO articles (guid, title, url, source, published_at) VALUES ('b1', 'Up1', 'http://x.com/b1', 'test', datetime('now', '-1 hour'))`
    ).run();
    db.prepare(
      `INSERT INTO impact_events (article_id, token_symbol, category, change_24h) VALUES (1, 'btc', 'market', 5.0)`
    ).run();
    db.prepare(
      `INSERT INTO articles (guid, title, url, source, published_at) VALUES ('b2', 'Up2', 'http://x.com/b2', 'test', datetime('now', '-2 hours'))`
    ).run();
    db.prepare(
      `INSERT INTO impact_events (article_id, token_symbol, category, change_24h) VALUES (2, 'eth', 'market', 3.0)`
    ).run();

    const { app } = createApp(db);
    const res = await request(app).get("/api/homepage/sentiment");
    expect(res.body.data.bullish).toBe(2);
    expect(res.body.data.bearish).toBe(0);
    expect(res.body.data.score).toBe(100);
    expect(res.body.data.label).toBe("Bullish");
  });
});

describe("GET /api/homepage/watchlist", () => {
  it("returns top 8 tokens by market cap for unauthenticated users", async () => {
    const db = createTestDatabase();
    seedTokensAndPrices(db);
    const { app } = createApp(db);

    const res = await request(app).get("/api/homepage/watchlist");
    expect(res.status).toBe(200);
    expect(res.body.data.tokens).toHaveLength(3);
    // Sorted by market cap desc
    expect(res.body.data.tokens[0].symbol).toBe("btc");
    expect(res.body.data.tokens[0].price).toBe(60000);
    expect(res.body.data.tokens[0].change_24h).toBe(2.5);
    expect(res.body.data.tokens[1].symbol).toBe("eth");
    expect(res.body.data.tokens[2].symbol).toBe("sol");
  });

  it("includes news_count_24h in response", async () => {
    const db = createTestDatabase();
    seedTokensAndPrices(db);
    // Add a recent article tagged with btc
    db.prepare(
      `INSERT INTO articles (guid, title, url, source, published_at, token_tags)
       VALUES ('n1', 'BTC news', 'http://x.com/n1', 'test', datetime('now', '-1 hour'), '["btc"]')`
    ).run();

    const { app } = createApp(db);
    const res = await request(app).get("/api/homepage/watchlist");
    expect(res.body.data.tokens[0].news_count_24h).toBe(1);
    expect(res.body.data.tokens[1].news_count_24h).toBe(0);
  });

  it("returns empty tokens array when no price data", async () => {
    const { app } = createApp();
    const res = await request(app).get("/api/homepage/watchlist");
    expect(res.status).toBe(200);
    expect(res.body.data.tokens).toEqual([]);
  });
});
