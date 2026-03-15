import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase } from "./database.js";
import { AlertRepository } from "./alert-repository.js";
import type Database from "better-sqlite3";

describe("AlertRepository", () => {
  let db: Database.Database;
  let repo: AlertRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new AlertRepository(db);
  });

  describe("preferences", () => {
    it("returns undefined when no preferences exist", () => {
      expect(repo.getPreferences("default")).toBeUndefined();
    });

    it("creates default preferences", () => {
      const prefs = repo.upsertPreferences({ userId: "default" });
      expect(prefs.user_id).toBe("default");
      expect(prefs.sensitivity).toBe("medium");
      expect(prefs.min_signals).toBe(2);
      expect(prefs.enabled).toBe(1);
      expect(JSON.parse(prefs.token_symbols)).toEqual([]);
      expect(JSON.parse(prefs.channels)).toEqual(["web"]);
    });

    it("creates preferences with custom values", () => {
      const prefs = repo.upsertPreferences({
        userId: "user1",
        tokenSymbols: ["BTC", "ETH"],
        channels: ["telegram", "email"],
        sensitivity: "high",
        priceChangeThreshold: 3.0,
        volumeChangeThreshold: 80.0,
        telegramChatId: "12345",
        emailAddress: "test@example.com",
      });

      expect(JSON.parse(prefs.token_symbols)).toEqual(["BTC", "ETH"]);
      expect(JSON.parse(prefs.channels)).toEqual(["telegram", "email"]);
      expect(prefs.sensitivity).toBe("high");
      expect(prefs.price_change_threshold).toBe(3.0);
      expect(prefs.telegram_chat_id).toBe("12345");
      expect(prefs.email_address).toBe("test@example.com");
    });

    it("updates existing preferences partially", () => {
      repo.upsertPreferences({
        userId: "user1",
        tokenSymbols: ["BTC"],
        channels: ["web"],
      });

      const updated = repo.upsertPreferences({
        userId: "user1",
        tokenSymbols: ["BTC", "SOL"],
      });

      expect(JSON.parse(updated.token_symbols)).toEqual(["BTC", "SOL"]);
      expect(JSON.parse(updated.channels)).toEqual(["web"]); // unchanged
    });

    it("applies sensitivity presets for new preferences", () => {
      const prefs = repo.upsertPreferences({
        userId: "user1",
        sensitivity: "high",
      });

      expect(prefs.price_change_threshold).toBe(2.0);
      expect(prefs.volume_change_threshold).toBe(50.0);
      expect(prefs.news_frequency_threshold).toBe(2);
    });

    it("getAllEnabledPreferences returns only enabled", () => {
      repo.upsertPreferences({ userId: "u1", enabled: true });
      repo.upsertPreferences({ userId: "u2", enabled: false });
      repo.upsertPreferences({ userId: "u3", enabled: true });

      const enabled = repo.getAllEnabledPreferences();
      expect(enabled).toHaveLength(2);
    });
  });

  describe("triggered alerts", () => {
    it("inserts and retrieves alerts", () => {
      const id = repo.insertTriggeredAlert({
        userId: "default",
        tokenSymbol: "BTC",
        signals: [{ type: "price_movement", value: 5.2 }],
        signalCount: 2,
        summary: "BTC alert",
        deliveredChannels: ["telegram"],
      });

      expect(id).toBeGreaterThan(0);

      const alerts = repo.getRecentAlerts("default", 24);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].token_symbol).toBe("BTC");
      expect(alerts[0].signal_count).toBe(2);
      expect(JSON.parse(alerts[0].signals)).toEqual([{ type: "price_movement", value: 5.2 }]);
    });

    it("hasRecentAlert detects recent alerts", () => {
      expect(repo.hasRecentAlert("default", "BTC", 30)).toBe(false);

      repo.insertTriggeredAlert({
        userId: "default",
        tokenSymbol: "BTC",
        signals: [],
        signalCount: 2,
        summary: "test",
        deliveredChannels: [],
      });

      expect(repo.hasRecentAlert("default", "BTC", 30)).toBe(true);
      expect(repo.hasRecentAlert("default", "ETH", 30)).toBe(false);
    });
  });
});
