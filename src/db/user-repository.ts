import crypto from "crypto";
import { getDatabase } from "./database.js";

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
  private db: ReturnType<typeof getDatabase>;

  constructor(db?: ReturnType<typeof getDatabase>) {
    this.db = db ?? getDatabase();
  }

  // --- Users ---

  findByEmail(email: string): User | undefined {
    return this.db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email) as User | undefined;
  }

  findById(id: string): User | undefined {
    return this.db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(id) as User | undefined;
  }

  findByStripeCustomerId(customerId: string): User | undefined {
    return this.db
      .prepare("SELECT * FROM users WHERE stripe_customer_id = ?")
      .get(customerId) as User | undefined;
  }

  createUser(email: string): User {
    const id = crypto.randomUUID();
    this.db
      .prepare("INSERT INTO users (id, email) VALUES (?, ?)")
      .run(id, email.toLowerCase());
    return this.findById(id)!;
  }

  findOrCreateByEmail(email: string): { user: User; isNew: boolean } {
    const normalized = email.toLowerCase();
    const existing = this.findByEmail(normalized);
    if (existing) return { user: existing, isNew: false };
    return { user: this.createUser(normalized), isNew: true };
  }

  updateTier(userId: string, tier: "free" | "pro"): void {
    this.db
      .prepare("UPDATE users SET tier = ?, updated_at = datetime('now') WHERE id = ?")
      .run(tier, userId);
  }

  updateStripeCustomerId(userId: string, customerId: string): void {
    this.db
      .prepare("UPDATE users SET stripe_customer_id = ?, updated_at = datetime('now') WHERE id = ?")
      .run(customerId, userId);
  }

  // --- Magic Links ---

  createMagicLink(email: string, expiresInMinutes = 15): MagicLink {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();
    this.db
      .prepare("INSERT INTO magic_links (email, token, expires_at) VALUES (?, ?, ?)")
      .run(email.toLowerCase(), token, expiresAt);
    return this.db
      .prepare("SELECT * FROM magic_links WHERE token = ?")
      .get(token) as MagicLink;
  }

  verifyMagicLink(token: string): MagicLink | null {
    const link = this.db
      .prepare("SELECT * FROM magic_links WHERE token = ? AND used = 0")
      .get(token) as MagicLink | undefined;
    if (!link) return null;
    if (new Date(link.expires_at) < new Date()) return null;
    // Mark as used
    this.db.prepare("UPDATE magic_links SET used = 1 WHERE id = ?").run(link.id);
    return link;
  }

  cleanExpiredLinks(): void {
    // expires_at is stored as ISO 8601 (e.g. "2024-01-15T10:30:45.000Z")
    // so compare against strftime which also produces a sortable format
    const nowIso = new Date().toISOString();
    this.db
      .prepare("DELETE FROM magic_links WHERE expires_at < ? OR used = 1")
      .run(nowIso);
  }

  // --- Subscriptions ---

  getActiveSubscription(userId: string): Subscription | undefined {
    return this.db
      .prepare(
        "SELECT * FROM subscriptions WHERE user_id = ? AND status IN ('active', 'trialing') ORDER BY created_at DESC LIMIT 1"
      )
      .get(userId) as Subscription | undefined;
  }

  upsertSubscription(sub: {
    id: string;
    userId: string;
    stripeSubscriptionId: string;
    status: string;
    plan?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
  }): void {
    this.db
      .prepare(
        `INSERT INTO subscriptions (id, user_id, stripe_subscription_id, status, plan, current_period_start, current_period_end, cancel_at_period_end)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(stripe_subscription_id) DO UPDATE SET
           status = excluded.status,
           current_period_start = excluded.current_period_start,
           current_period_end = excluded.current_period_end,
           cancel_at_period_end = excluded.cancel_at_period_end,
           updated_at = datetime('now')`
      )
      .run(
        sub.id,
        sub.userId,
        sub.stripeSubscriptionId,
        sub.status,
        sub.plan ?? "pro",
        sub.currentPeriodStart ?? null,
        sub.currentPeriodEnd ?? null,
        sub.cancelAtPeriodEnd ? 1 : 0
      );
  }

  // --- API Usage ---

  getApiUsageCount(userId: string, date: string): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM api_usage WHERE user_id = ? AND request_date = ?")
      .get(userId, date) as { count: number };
    return result.count;
  }

  recordApiUsage(userId: string, endpoint: string): void {
    const date = new Date().toISOString().split("T")[0];
    this.db
      .prepare("INSERT INTO api_usage (user_id, endpoint, request_date) VALUES (?, ?, ?)")
      .run(userId, endpoint, date);
  }

  getDailyAlertCount(userId: string): number {
    const today = new Date().toISOString().split("T")[0];
    const result = this.db
      .prepare(
        "SELECT COUNT(*) as count FROM triggered_alerts WHERE user_id = ? AND date(created_at) = ?"
      )
      .get(userId, today) as { count: number };
    return result.count;
  }
}
