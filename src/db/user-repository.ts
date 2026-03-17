import crypto from "crypto";
import { Pool } from "pg";
import { getPool } from "./database.js";

export interface User {
  id: string;
  email: string;
  tier: "free" | "pro";
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MagicLink {
  id: number;
  email: string;
  token: string;
  expires_at: string;
  used: number;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_subscription_id: string;
  status: string;
  plan: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: number;
  created_at: string;
  updated_at: string;
}

export class UserRepository {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? getPool();
  }

  // --- Users ---

  async findByEmail(email: string): Promise<User | undefined> {
    const { rows } = await this.pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    return rows[0] as User | undefined;
  }

  async findById(id: string): Promise<User | undefined> {
    const { rows } = await this.pool.query(
      "SELECT * FROM users WHERE id = $1",
      [id]
    );
    return rows[0] as User | undefined;
  }

  async findByStripeCustomerId(customerId: string): Promise<User | undefined> {
    const { rows } = await this.pool.query(
      "SELECT * FROM users WHERE stripe_customer_id = $1",
      [customerId]
    );
    return rows[0] as User | undefined;
  }

  async createUser(email: string): Promise<User> {
    const id = crypto.randomUUID();
    await this.pool.query(
      "INSERT INTO users (id, email) VALUES ($1, $2)",
      [id, email.toLowerCase()]
    );
    return (await this.findById(id))!;
  }

  async findOrCreateByEmail(email: string): Promise<{ user: User; isNew: boolean }> {
    const normalized = email.toLowerCase();
    const existing = await this.findByEmail(normalized);
    if (existing) return { user: existing, isNew: false };
    return { user: await this.createUser(normalized), isNew: true };
  }

  async updateTier(userId: string, tier: "free" | "pro"): Promise<void> {
    await this.pool.query(
      "UPDATE users SET tier = $1, updated_at = NOW() WHERE id = $2",
      [tier, userId]
    );
  }

  async updateStripeCustomerId(userId: string, customerId: string): Promise<void> {
    await this.pool.query(
      "UPDATE users SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2",
      [customerId, userId]
    );
  }

  // --- Magic Links ---

  async createMagicLink(email: string, expiresInMinutes = 15): Promise<MagicLink> {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();
    await this.pool.query(
      "INSERT INTO magic_links (email, token, expires_at) VALUES ($1, $2, $3)",
      [email.toLowerCase(), token, expiresAt]
    );
    const { rows } = await this.pool.query(
      "SELECT * FROM magic_links WHERE token = $1",
      [token]
    );
    return rows[0] as MagicLink;
  }

  async verifyMagicLink(token: string): Promise<MagicLink | null> {
    const { rows } = await this.pool.query(
      "SELECT * FROM magic_links WHERE token = $1 AND used = 0",
      [token]
    );
    const link = rows[0] as MagicLink | undefined;
    if (!link) return null;
    if (new Date(link.expires_at) < new Date()) return null;
    await this.pool.query(
      "UPDATE magic_links SET used = 1 WHERE id = $1",
      [link.id]
    );
    return link;
  }

  async cleanExpiredLinks(): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.pool.query(
      "DELETE FROM magic_links WHERE expires_at < $1 OR used = 1",
      [nowIso]
    );
  }

  // --- Subscriptions ---

  async getActiveSubscription(userId: string): Promise<Subscription | undefined> {
    const { rows } = await this.pool.query(
      "SELECT * FROM subscriptions WHERE user_id = $1 AND status IN ('active', 'trialing') ORDER BY created_at DESC LIMIT 1",
      [userId]
    );
    return rows[0] as Subscription | undefined;
  }

  async upsertSubscription(sub: {
    id: string;
    userId: string;
    stripeSubscriptionId: string;
    status: string;
    plan?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO subscriptions (id, user_id, stripe_subscription_id, status, plan, current_period_start, current_period_end, cancel_at_period_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT(stripe_subscription_id) DO UPDATE SET
           status = excluded.status,
           current_period_start = excluded.current_period_start,
           current_period_end = excluded.current_period_end,
           cancel_at_period_end = excluded.cancel_at_period_end,
           updated_at = NOW()`,
      [
        sub.id,
        sub.userId,
        sub.stripeSubscriptionId,
        sub.status,
        sub.plan ?? "pro",
        sub.currentPeriodStart ?? null,
        sub.currentPeriodEnd ?? null,
        sub.cancelAtPeriodEnd ? 1 : 0,
      ]
    );
  }

  // --- API Usage ---

  async getApiUsageCount(userId: string, date: string): Promise<number> {
    const { rows } = await this.pool.query(
      "SELECT COUNT(*) as count FROM api_usage WHERE user_id = $1 AND request_date = $2",
      [userId, date]
    );
    return Number(rows[0].count);
  }

  async recordApiUsage(userId: string, endpoint: string): Promise<void> {
    const date = new Date().toISOString().split("T")[0];
    await this.pool.query(
      "INSERT INTO api_usage (user_id, endpoint, request_date) VALUES ($1, $2, $3)",
      [userId, endpoint, date]
    );
  }

  async getDailyAlertCount(userId: string): Promise<number> {
    const today = new Date().toISOString().split("T")[0];
    const { rows } = await this.pool.query(
      "SELECT COUNT(*) as count FROM triggered_alerts WHERE user_id = $1 AND created_at::date = $2",
      [userId, today]
    );
    return Number(rows[0].count);
  }
}
