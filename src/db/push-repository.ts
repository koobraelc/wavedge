import type Database from "better-sqlite3";
import { getDatabase } from "./database.js";

export interface PushSubscriptionRow {
  id: number;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export class PushRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  /** Save or update a push subscription for a user */
  upsert(userId: string, endpoint: string, p256dh: string, auth: string): void {
    this.db
      .prepare(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET
           user_id = excluded.user_id,
           p256dh = excluded.p256dh,
           auth = excluded.auth`
      )
      .run(userId, endpoint, p256dh, auth);
  }

  /** Remove a push subscription by endpoint */
  removeByEndpoint(endpoint: string): void {
    this.db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
  }

  /** Remove all push subscriptions for a user */
  removeByUser(userId: string): void {
    this.db.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").run(userId);
  }

  /** Get all push subscriptions for a user */
  getByUser(userId: string): PushSubscriptionRow[] {
    return this.db
      .prepare("SELECT * FROM push_subscriptions WHERE user_id = ?")
      .all(userId) as PushSubscriptionRow[];
  }

  /** Check if a user has any push subscriptions */
  hasSubscription(userId: string): boolean {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM push_subscriptions WHERE user_id = ?")
      .get(userId) as { count: number };
    return row.count > 0;
  }
}
