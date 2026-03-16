import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase } from "./database.js";
import { DigestRepository } from "./digest-repository.js";
import type Database from "better-sqlite3";

describe("DigestRepository", () => {
  let db: Database.Database;
  let repo: DigestRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new DigestRepository(db);
  });

  describe("subscribeEmail", () => {
    it("creates a new email subscriber", () => {
      const sub = repo.subscribeEmail("test@example.com", "en");
      expect(sub.email).toBe("test@example.com");
      expect(sub.lang).toBe("en");
      expect(sub.active).toBe(1);
      expect(sub.unsubscribe_token).toBeTruthy();
    });

    it("reactivates an unsubscribed email", () => {
      const sub = repo.subscribeEmail("test@example.com");
      repo.unsubscribeEmail("test@example.com");

      const resubbed = repo.subscribeEmail("test@example.com", "zh");
      expect(resubbed.active).toBe(1);
      expect(resubbed.lang).toBe("zh");
    });

    it("subscribes with zh language", () => {
      const sub = repo.subscribeEmail("zh@example.com", "zh");
      expect(sub.lang).toBe("zh");
    });
  });

  describe("subscribeTelegram", () => {
    it("creates a new telegram subscriber", () => {
      const sub = repo.subscribeTelegram("123456", "zh");
      expect(sub.telegram_chat_id).toBe("123456");
      expect(sub.lang).toBe("zh");
      expect(sub.active).toBe(1);
    });
  });

  describe("unsubscribe", () => {
    it("unsubscribes by token", () => {
      const sub = repo.subscribeEmail("test@example.com");
      const success = repo.unsubscribeByToken(sub.unsubscribe_token);
      expect(success).toBe(true);

      const subs = repo.getActiveSubscribers();
      expect(subs).toHaveLength(0);
    });

    it("returns false for invalid token", () => {
      expect(repo.unsubscribeByToken("invalid-token")).toBe(false);
    });

    it("unsubscribes by email", () => {
      repo.subscribeEmail("test@example.com");
      const success = repo.unsubscribeEmail("test@example.com");
      expect(success).toBe(true);
    });
  });

  describe("getActiveSubscribers", () => {
    it("returns only active subscribers", () => {
      repo.subscribeEmail("a@test.com", "en");
      repo.subscribeEmail("b@test.com", "en");
      repo.subscribeEmail("c@test.com", "zh");
      repo.unsubscribeEmail("b@test.com");

      expect(repo.getActiveSubscribers()).toHaveLength(2);
      expect(repo.getActiveSubscribers("en")).toHaveLength(1);
      expect(repo.getActiveSubscribers("zh")).toHaveLength(1);
    });
  });

  describe("getSubscriberCount", () => {
    it("returns correct counts", () => {
      repo.subscribeEmail("a@test.com");
      repo.subscribeEmail("b@test.com");
      repo.unsubscribeEmail("b@test.com");

      const counts = repo.getSubscriberCount();
      expect(counts.total).toBe(2);
      expect(counts.active).toBe(1);
    });
  });

  describe("digest history", () => {
    it("saves and retrieves digests", () => {
      const id = repo.saveDigest({
        lang: "en",
        subject: "Test digest",
        contentHtml: "<h1>test</h1>",
        contentTelegram: "test",
        emailsSent: 5,
        telegramsSent: 3,
      });
      expect(id).toBeGreaterThan(0);

      const digests = repo.getRecentDigests();
      expect(digests).toHaveLength(1);
      expect(digests[0].subject).toBe("Test digest");
      expect(digests[0].emails_sent).toBe(5);
    });

    it("getLatestDigest returns most recent for lang", () => {
      repo.saveDigest({
        lang: "en",
        subject: "EN digest",
        contentHtml: "<h1>en</h1>",
        contentTelegram: "en",
        emailsSent: 1,
        telegramsSent: 0,
      });
      repo.saveDigest({
        lang: "zh",
        subject: "ZH digest",
        contentHtml: "<h1>zh</h1>",
        contentTelegram: "zh",
        emailsSent: 0,
        telegramsSent: 1,
      });

      const en = repo.getLatestDigest("en");
      expect(en?.subject).toBe("EN digest");

      const zh = repo.getLatestDigest("zh");
      expect(zh?.subject).toBe("ZH digest");

      expect(repo.getLatestDigest("fr")).toBeUndefined();
    });
  });
});
