import { Pool } from "pg";
import { getPool } from "./database.js";

export interface PushSubscriptionRow {
  id: number;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export class PushRepository {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || getPool();
  }

  /** Save or update a push subscription for a user */
  async upsert(userId: string, endpoint: string, p256dh: string, auth: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth`,
      [userId, endpoint, p256dh, auth]
    );
  }

  /** Remove a push subscription by endpoint */
  async removeByEndpoint(endpoint: string): Promise<void> {
    await this.pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
  }

  /** Remove all push subscriptions for a user */
  async removeByUser(userId: string): Promise<void> {
    await this.pool.query("DELETE FROM push_subscriptions WHERE user_id = $1", [userId]);
  }

  /** Get all push subscriptions for a user */
  async getByUser(userId: string): Promise<PushSubscriptionRow[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM push_subscriptions WHERE user_id = $1",
      [userId]
    );
    return rows;
  }

  /** Check if a user has any push subscriptions */
  async hasSubscription(userId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      "SELECT COUNT(*) as count FROM push_subscriptions WHERE user_id = $1",
      [userId]
    );
    return rows[0].count > 0;
  }
}
