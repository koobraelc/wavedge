import crypto from "crypto";
import { Pool } from "@neondatabase/serverless";
import { getPool } from "./database";

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
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? getPool();
  }

  /**
   * Generate a new API key for a user. Returns the full plaintext key
   * (only time it's available) and the stored record.
   */
  async create(userId: string, name: string): Promise<{ key: string; record: ApiKey }> {
    const id = crypto.randomUUID();
    const rawKey = crypto.randomBytes(32).toString("base64url");
    const key = `wv_${rawKey}`;
    const keyHash = this.hashKey(key);
    const keyPrefix = key.slice(0, 10);

    const { rows } = await this.pool.query(
      "INSERT INTO api_keys (id, user_id, key_hash, key_prefix, name) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [id, userId, keyHash, keyPrefix, name]
    );

    return { key, record: rows[0] };
  }

  /**
   * Find a non-revoked API key by its plaintext value (hashed for lookup).
   */
  async findByKey(plaintext: string): Promise<ApiKey | undefined> {
    const keyHash = this.hashKey(plaintext);
    const { rows } = await this.pool.query(
      "SELECT * FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL",
      [keyHash]
    );
    return rows[0];
  }

  /**
   * List all API keys for a user (active and revoked).
   */
  async listByUser(userId: string): Promise<ApiKey[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC",
      [userId]
    );
    return rows;
  }

  /**
   * Count active (non-revoked) keys for a user.
   */
  async countActive(userId: string): Promise<number> {
    const { rows } = await this.pool.query(
      "SELECT COUNT(*) as count FROM api_keys WHERE user_id = $1 AND revoked_at IS NULL",
      [userId]
    );
    return rows[0].count;
  }

  /**
   * Revoke an API key. Only the owning user can revoke their own key.
   */
  async revoke(keyId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      "UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL",
      [keyId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Update last_used_at timestamp for a key.
   */
  async touchLastUsed(keyId: string): Promise<void> {
    await this.pool.query(
      "UPDATE api_keys SET last_used_at = NOW() WHERE id = $1",
      [keyId]
    );
  }

  /**
   * Hash a plaintext API key using SHA-256.
   */
  private hashKey(plaintext: string): string {
    return crypto.createHash("sha256").update(plaintext).digest("hex");
  }
}
