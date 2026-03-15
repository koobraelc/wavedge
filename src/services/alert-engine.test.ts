import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase } from "../db/database.js";
import { AlertRepository } from "../db/alert-repository.js";
import { PriceRepository } from "../db/price-repository.js";
import { NewsRepository } from "../db/news-repository.js";
import { AlertEngine } from "./alert-engine.js";
import type Database from "better-sqlite3";

describe("AlertEngine", () => {
  let db: Database.Database;
  let alertRepo: AlertRepository;
  let priceRepo: PriceRepository;
  let newsRepo: NewsRepository;
  let engine: AlertEngine;

  beforeEach(() => {
    db = createTestDatabase();
    alertRepo = new AlertRepository(db);
    priceRepo = new PriceRepository(db);
    newsRepo = new NewsRepository(db);
    engine = new AlertEngine(alertRepo, priceRepo, db);
  });

  it("does nothing when no preferences exist", async () => {
    const result = await engine.runCycle();
    expect(result.alertsTriggered).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("does nothing when no signals fire", async () => {
    alertRepo.upsertPreferences({
      userId: "user1",
      tokenSymbols: ["BTC"],
      channels: ["web"],
      enabled: true,
    });

    const result = await engine.runCycle();
    expect(result.alertsTriggered).toBe(0);
  });

  it("fires alert when multiple signals meet threshold", async () => {
    // Set up preferences requiring 2 signals
    alertRepo.upsertPreferences({
      userId: "user1",
      tokenSymbols: ["BTC"],
      channels: ["web"],
      minSignals: 2,
      priceChangeThreshold: 5.0,
      newsFrequencyThreshold: 3,
      volumeChangeThreshold: 100.0,
      newsWindowMinutes: 60,
      enabled: true,
    });

    // Create price movement signal (>5%)
    priceRepo.upsertToken("bitcoin", "btc", "Bitcoin");
    db.prepare(
      `INSERT INTO prices (token_id, price_usd, total_volume, fetched_at) VALUES (?, ?, ?, datetime('now', '-65 minutes'))`
    ).run("bitcoin", 80000, 1000000);
    db.prepare(
      `INSERT INTO prices (token_id, price_usd, total_volume, fetched_at) VALUES (?, ?, ?, datetime('now'))`
    ).run("bitcoin", 85000, 2500000); // +6.25% price, +150% volume

    const result = await engine.runCycle();
    expect(result.alertsTriggered).toBe(1);

    // Verify alert was recorded
    const alerts = alertRepo.getRecentAlerts("user1", 1);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].token_symbol).toBe("BTC");
    expect(alerts[0].signal_count).toBeGreaterThanOrEqual(2);
  });

  it("deduplicates alerts within 30 minutes", async () => {
    alertRepo.upsertPreferences({
      userId: "user1",
      tokenSymbols: ["BTC"],
      channels: ["web"],
      minSignals: 2,
      priceChangeThreshold: 5.0,
      volumeChangeThreshold: 100.0,
      newsWindowMinutes: 60,
      enabled: true,
    });

    priceRepo.upsertToken("bitcoin", "btc", "Bitcoin");
    db.prepare(
      `INSERT INTO prices (token_id, price_usd, total_volume, fetched_at) VALUES (?, ?, ?, datetime('now', '-65 minutes'))`
    ).run("bitcoin", 80000, 1000000);
    db.prepare(
      `INSERT INTO prices (token_id, price_usd, total_volume, fetched_at) VALUES (?, ?, ?, datetime('now'))`
    ).run("bitcoin", 85000, 2500000);

    // First cycle triggers
    const result1 = await engine.runCycle();
    expect(result1.alertsTriggered).toBe(1);

    // Second cycle should be deduped
    const result2 = await engine.runCycle();
    expect(result2.alertsTriggered).toBe(0);
  });

  it("skips disabled preferences", async () => {
    alertRepo.upsertPreferences({
      userId: "user1",
      tokenSymbols: ["BTC"],
      channels: ["web"],
      enabled: false,
    });

    const result = await engine.runCycle();
    expect(result.alertsTriggered).toBe(0);
  });

  it("uses top tokens when no tokens configured", async () => {
    alertRepo.upsertPreferences({
      userId: "user1",
      tokenSymbols: [],
      channels: ["web"],
      minSignals: 2,
      priceChangeThreshold: 5.0,
      volumeChangeThreshold: 100.0,
      enabled: true,
    });

    // Add a token with strong signals
    priceRepo.upsertToken("bitcoin", "btc", "Bitcoin");
    db.prepare(
      `INSERT INTO prices (token_id, price_usd, total_volume, market_cap, fetched_at) VALUES (?, ?, ?, ?, datetime('now', '-65 minutes'))`
    ).run("bitcoin", 80000, 1000000, 1500000000000);
    db.prepare(
      `INSERT INTO prices (token_id, price_usd, total_volume, market_cap, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run("bitcoin", 85000, 2500000, 1600000000000);

    const result = await engine.runCycle();
    // Should check BTC even though tokenSymbols is empty
    expect(result.alertsTriggered).toBe(1);
  });
});
