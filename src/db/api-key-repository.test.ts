import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase } from "./database.js";
import { ApiKeyRepository } from "./api-key-repository.js";
import { UserRepository } from "./user-repository.js";
import type Database from "better-sqlite3";

describe("ApiKeyRepository", () => {
  let db: Database.Database;
  let repo: ApiKeyRepository;
  let userRepo: UserRepository;
  let userId: string;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new ApiKeyRepository(db);
    userRepo = new UserRepository(db);
    const user = userRepo.createUser("apitest@example.com");
    userId = user.id;
  });

  it("creates an API key with wv_ prefix", () => {
    const { key, record } = repo.create(userId, "Test Key");
    expect(key).toMatch(/^wv_/);
    expect(record.name).toBe("Test Key");
    expect(record.user_id).toBe(userId);
    expect(record.key_prefix).toBe(key.slice(0, 10));
    expect(record.revoked_at).toBeNull();
  });

  it("never stores the plaintext key", () => {
    const { key, record } = repo.create(userId, "Secret");
    // The hash should not equal the key
    expect(record.key_hash).not.toBe(key);
    expect(record.key_hash).toHaveLength(64); // SHA-256 hex
  });

  it("finds a key by plaintext value", () => {
    const { key } = repo.create(userId, "Lookup");
    const found = repo.findByKey(key);
    expect(found).toBeDefined();
    expect(found!.name).toBe("Lookup");
  });

  it("does not find a revoked key", () => {
    const { key, record } = repo.create(userId, "Revokable");
    repo.revoke(record.id, userId);
    const found = repo.findByKey(key);
    expect(found).toBeUndefined();
  });

  it("lists all keys for a user", () => {
    repo.create(userId, "Key 1");
    repo.create(userId, "Key 2");
    const keys = repo.listByUser(userId);
    expect(keys).toHaveLength(2);
  });

  it("counts active keys", () => {
    const { record: r1 } = repo.create(userId, "Active 1");
    repo.create(userId, "Active 2");
    repo.revoke(r1.id, userId);
    expect(repo.countActive(userId)).toBe(1);
  });

  it("revoke returns false for wrong user", () => {
    const otherUser = userRepo.createUser("other@example.com");
    const { record } = repo.create(userId, "Mine");
    const result = repo.revoke(record.id, otherUser.id);
    expect(result).toBe(false);
  });

  it("revoke returns false for already revoked key", () => {
    const { record } = repo.create(userId, "Once");
    expect(repo.revoke(record.id, userId)).toBe(true);
    expect(repo.revoke(record.id, userId)).toBe(false);
  });

  it("updates last_used_at on touch", () => {
    const { record } = repo.create(userId, "Touch");
    expect(record.last_used_at).toBeNull();
    repo.touchLastUsed(record.id);
    const updated = repo.listByUser(userId).find((k) => k.id === record.id);
    expect(updated!.last_used_at).not.toBeNull();
  });
});
