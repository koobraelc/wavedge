import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase } from "./database.js";
import { UserRepository } from "./user-repository.js";
import type Database from "better-sqlite3";

describe("UserRepository", () => {
  let db: Database.Database;
  let repo: UserRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new UserRepository(db);
  });

  describe("users", () => {
    it("creates a user", () => {
      const user = repo.createUser("test@example.com");
      expect(user.email).toBe("test@example.com");
      expect(user.tier).toBe("free");
      expect(user.id).toBeTruthy();
    });

    it("normalizes email to lowercase", () => {
      const user = repo.createUser("TEST@Example.COM");
      expect(user.email).toBe("test@example.com");
    });

    it("finds user by email", () => {
      const created = repo.createUser("find@test.com");
      const found = repo.findByEmail("find@test.com");
      expect(found?.id).toBe(created.id);
    });

    it("finds user by id", () => {
      const created = repo.createUser("findid@test.com");
      const found = repo.findById(created.id);
      expect(found?.email).toBe("findid@test.com");
    });

    it("findOrCreateByEmail returns existing user", () => {
      const first = repo.findOrCreateByEmail("dup@test.com");
      const second = repo.findOrCreateByEmail("dup@test.com");
      expect(first.user.id).toBe(second.user.id);
      expect(first.isNew).toBe(true);
      expect(second.isNew).toBe(false);
    });

    it("updates tier", () => {
      const user = repo.createUser("tier@test.com");
      repo.updateTier(user.id, "pro");
      const updated = repo.findById(user.id)!;
      expect(updated.tier).toBe("pro");
    });

    it("updates stripe customer id", () => {
      const user = repo.createUser("stripe@test.com");
      repo.updateStripeCustomerId(user.id, "cus_123");
      const updated = repo.findById(user.id)!;
      expect(updated.stripe_customer_id).toBe("cus_123");
    });

    it("finds by stripe customer id", () => {
      const user = repo.createUser("stripe2@test.com");
      repo.updateStripeCustomerId(user.id, "cus_456");
      const found = repo.findByStripeCustomerId("cus_456");
      expect(found?.id).toBe(user.id);
    });
  });

  describe("magic links", () => {
    it("creates a magic link", () => {
      const link = repo.createMagicLink("magic@test.com");
      expect(link.email).toBe("magic@test.com");
      expect(link.token).toBeTruthy();
      expect(link.used).toBe(0);
    });

    it("verifies a valid magic link", () => {
      const link = repo.createMagicLink("verify@test.com");
      const verified = repo.verifyMagicLink(link.token);
      expect(verified).not.toBeNull();
      expect(verified!.email).toBe("verify@test.com");
    });

    it("marks magic link as used after verification", () => {
      const link = repo.createMagicLink("used@test.com");
      repo.verifyMagicLink(link.token);
      // Second verification should fail
      const again = repo.verifyMagicLink(link.token);
      expect(again).toBeNull();
    });

    it("rejects expired magic links", () => {
      // Insert a link with an already-past expiry directly
      db.prepare("INSERT INTO magic_links (email, token, expires_at, used) VALUES (?, ?, ?, 0)")
        .run("expired@test.com", "expired-token", "2020-01-01T00:00:00.000Z");
      const verified = repo.verifyMagicLink("expired-token");
      expect(verified).toBeNull();
    });

    it("rejects invalid tokens", () => {
      expect(repo.verifyMagicLink("nonexistent")).toBeNull();
    });
  });

  describe("subscriptions", () => {
    it("upserts and retrieves a subscription", () => {
      const user = repo.createUser("sub@test.com");
      repo.upsertSubscription({
        id: "sub_1",
        userId: user.id,
        stripeSubscriptionId: "sub_stripe_1",
        status: "active",
        plan: "pro",
      });

      const sub = repo.getActiveSubscription(user.id);
      expect(sub).toBeDefined();
      expect(sub!.status).toBe("active");
      expect(sub!.stripe_subscription_id).toBe("sub_stripe_1");
    });

    it("updates subscription on conflict", () => {
      const user = repo.createUser("upsub@test.com");
      repo.upsertSubscription({
        id: "sub_2",
        userId: user.id,
        stripeSubscriptionId: "sub_stripe_2",
        status: "active",
      });
      repo.upsertSubscription({
        id: "sub_3",
        userId: user.id,
        stripeSubscriptionId: "sub_stripe_2",
        status: "canceled",
      });

      const sub = repo.getActiveSubscription(user.id);
      // Canceled subscription should not be returned as active
      expect(sub).toBeUndefined();
    });
  });

  describe("api usage", () => {
    it("records and counts usage", () => {
      const user = repo.createUser("usage@test.com");
      const today = new Date().toISOString().split("T")[0];

      expect(repo.getApiUsageCount(user.id, today)).toBe(0);
      repo.recordApiUsage(user.id, "/api/prices");
      repo.recordApiUsage(user.id, "/api/news");
      expect(repo.getApiUsageCount(user.id, today)).toBe(2);
    });
  });
});
