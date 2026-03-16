import crypto from "crypto";
import type Database from "better-sqlite3";
import { getDatabase } from "./database.js";

export interface DigestSubscriberRow {
  id: number;
  email: string | null;
  telegram_chat_id: string | null;
  lang: string;
  active: number;
  unsubscribe_token: string;
  created_at: string;
  updated_at: string;
}

export interface DigestHistoryRow {
  id: number;
  lang: string;
  subject: string;
  content_html: string;
  content_telegram: string;
  emails_sent: number;
  telegrams_sent: number;
  generated_at: string;
}

export class DigestRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  subscribeEmail(email: string, lang: "en" | "zh" = "en"): DigestSubscriberRow {
    const token = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO digest_subscribers (email, lang, unsubscribe_token)
         VALUES (?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET
           active = 1,
           lang = excluded.lang,
           updated_at = datetime('now')`
      )
      .run(email, lang, token);

    return this.db
      .prepare("SELECT * FROM digest_subscribers WHERE email = ?")
      .get(email) as DigestSubscriberRow;
  }

  subscribeTelegram(chatId: string, lang: "en" | "zh" = "en"): DigestSubscriberRow {
    const token = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO digest_subscribers (telegram_chat_id, lang, unsubscribe_token)
         VALUES (?, ?, ?)
         ON CONFLICT(telegram_chat_id) DO UPDATE SET
           active = 1,
           lang = excluded.lang,
           updated_at = datetime('now')`
      )
      .run(chatId, lang, token);

    return this.db
      .prepare("SELECT * FROM digest_subscribers WHERE telegram_chat_id = ?")
      .get(chatId) as DigestSubscriberRow;
  }

  unsubscribeByToken(token: string): boolean {
    const result = this.db
      .prepare(
        "UPDATE digest_subscribers SET active = 0, updated_at = datetime('now') WHERE unsubscribe_token = ?"
      )
      .run(token);
    return result.changes > 0;
  }

  unsubscribeEmail(email: string): boolean {
    const result = this.db
      .prepare(
        "UPDATE digest_subscribers SET active = 0, updated_at = datetime('now') WHERE email = ?"
      )
      .run(email);
    return result.changes > 0;
  }

  getActiveSubscribers(lang?: string): DigestSubscriberRow[] {
    if (lang) {
      return this.db
        .prepare("SELECT * FROM digest_subscribers WHERE active = 1 AND lang = ?")
        .all(lang) as DigestSubscriberRow[];
    }
    return this.db
      .prepare("SELECT * FROM digest_subscribers WHERE active = 1")
      .all() as DigestSubscriberRow[];
  }

  getSubscriberCount(): { active: number; total: number } {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) as total, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active FROM digest_subscribers"
      )
      .get() as { total: number; active: number };
    return { active: row.active ?? 0, total: row.total };
  }

  saveDigest(digest: {
    lang: string;
    subject: string;
    contentHtml: string;
    contentTelegram: string;
    emailsSent: number;
    telegramsSent: number;
  }): number {
    const result = this.db
      .prepare(
        `INSERT INTO digest_history (lang, subject, content_html, content_telegram, emails_sent, telegrams_sent)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        digest.lang,
        digest.subject,
        digest.contentHtml,
        digest.contentTelegram,
        digest.emailsSent,
        digest.telegramsSent
      );
    return result.lastInsertRowid as number;
  }

  getRecentDigests(limit: number = 10): DigestHistoryRow[] {
    return this.db
      .prepare("SELECT * FROM digest_history ORDER BY generated_at DESC LIMIT ?")
      .all(limit) as DigestHistoryRow[];
  }

  getLatestDigest(lang: string): DigestHistoryRow | undefined {
    return this.db
      .prepare("SELECT * FROM digest_history WHERE lang = ? ORDER BY generated_at DESC LIMIT 1")
      .get(lang) as DigestHistoryRow | undefined;
  }
}
