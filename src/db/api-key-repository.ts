import crypto from "crypto";
import { getDatabase } from "./database.js";

export interface ApiKey {
  id: string;
  user_id: string;
  key_hash: string;
  key_prefix: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export class ApiKeyRepository {
  private db: ReturnType<typeof getDatabase>;

  constructor(db?: ReturnType<typeof getDatabase>) {
    this.db = db ?? getDatabase();
  }

  /**
   * Generate a new API key for a user. Returns the full plaintext key
   * (only time it's available) and the stored record.
   */
  create(userId: string, name: string): { key: string; record: ApiKey } {
    const id = crypto.randomUUID();
    // Generate a 32-byte random key, base64url encoded
    const rawKey = crypto.randomBytes(32).toString("base64url");
    const key = `wv_${rawKey}`;
    const keyHash = this.hashKey(key);
    const keyPrefix = key.slice(0, 10);

    this.db
      .prepare(
        "INSERT INTO api_keys (id, user_id, key_hash, key_prefix, name) VALUES (?, ?, ?, ?, ?)"
      )
      .run(id, userId, keyHash, keyPrefix, name);

    const record = this.db
      .prepare("SELECT * FROM api_keys WHERE id = ?")
      .get(id) as ApiKey;

    return { key, record };
  }

  /**
   * Find a non-revoked API key by its plaintext value (hashed for lookup).
   */
  findByKey(plaintext: string): ApiKey | undefined {
    const keyHash = this.hashKey(plaintext);
    return this.db
      .prepare("SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL")
      .get(keyHash) as ApiKey | undefined;
  }

  /**
   * List all API keys for a user (active and revoked).
   */
  listByUser(userId: string): ApiKey[] {
    return this.db
      .prepare("SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC")
      .all(userId) as ApiKey[];
  }

  /**
   * Count active (non-revoked) keys for a user.
   */
  countActive(userId: string): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM api_keys WHERE user_id = ? AND revoked_at IS NULL")
      .get(userId) as { count: number };
    return result.count;
  }

  /**
   * Revoke an API key. Only the owning user can revoke their own key.
   */
  revoke(keyId: string, userId: string): boolean {
    const result = this.db
      .prepare(
        "UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ? AND user_id = ? AND revoked_at IS NULL"
      )
      .run(keyId, userId);
    return result.changes > 0;
  }

  /**
   * Update last_used_at timestamp for a key.
   */
  touchLastUsed(keyId: string): void {
    this.db
      .prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?")
      .run(keyId);
  }

  /**
   * Hash a plaintext API key using SHA-256.
   */
  private hashKey(plaintext: string): string {
    return crypto.createHash("sha256").update(plaintext).digest("hex");
  }
}
