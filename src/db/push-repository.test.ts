import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase } from "./database.js";
import { PushRepository } from "./push-repository.js";
import type Database from "better-sqlite3";

describe("PushRepository", () => {
  let db: Database.Database;
  let repo: PushRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new PushRepository(db);
  });

  it("upserts and retrieves subscriptions", () => {
    repo.upsert("user1", "https://push.example.com/1", "p256dh-key-1", "auth-key-1");

    const subs = repo.getByUser("user1");
    expect(subs).toHaveLength(1);
    expect(subs[0].endpoint).toBe("https://push.example.com/1");
    expect(subs[0].p256dh).toBe("p256dh-key-1");
    expect(subs[0].auth).toBe("auth-key-1");
  });

  it("updates existing subscription on same endpoint", () => {
    repo.upsert("user1", "https://push.example.com/1", "old-key", "old-auth");
    repo.upsert("user1", "https://push.example.com/1", "new-key", "new-auth");

    const subs = repo.getByUser("user1");
    expect(subs).toHaveLength(1);
    expect(subs[0].p256dh).toBe("new-key");
  });

  it("supports multiple subscriptions per user", () => {
    repo.upsert("user1", "https://push.example.com/1", "k1", "a1");
    repo.upsert("user1", "https://push.example.com/2", "k2", "a2");

    expect(repo.getByUser("user1")).toHaveLength(2);
  });

  it("removes subscription by endpoint", () => {
    repo.upsert("user1", "https://push.example.com/1", "k1", "a1");
    repo.upsert("user1", "https://push.example.com/2", "k2", "a2");

    repo.removeByEndpoint("https://push.example.com/1");

    const subs = repo.getByUser("user1");
    expect(subs).toHaveLength(1);
    expect(subs[0].endpoint).toBe("https://push.example.com/2");
  });

  it("removes all subscriptions for a user", () => {
    repo.upsert("user1", "https://push.example.com/1", "k1", "a1");
    repo.upsert("user1", "https://push.example.com/2", "k2", "a2");
    repo.upsert("user2", "https://push.example.com/3", "k3", "a3");

    repo.removeByUser("user1");

    expect(repo.getByUser("user1")).toHaveLength(0);
    expect(repo.getByUser("user2")).toHaveLength(1);
  });

  it("hasSubscription returns correct status", () => {
    expect(repo.hasSubscription("user1")).toBe(false);

    repo.upsert("user1", "https://push.example.com/1", "k1", "a1");
    expect(repo.hasSubscription("user1")).toBe(true);

    repo.removeByEndpoint("https://push.example.com/1");
    expect(repo.hasSubscription("user1")).toBe(false);
  });
});
