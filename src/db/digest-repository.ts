import crypto from "crypto";
import { Pool } from "pg";
import { getPool } from "./database.js";

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
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || getPool();
  }

  async subscribeEmail(email: string, lang: "en" | "zh" = "en"): Promise<DigestSubscriberRow> {
    const token = crypto.randomUUID();
    await this.pool.query(
      `INSERT INTO digest_subscribers (email, lang, unsubscribe_token)
         VALUES ($1, $2, $3)
         ON CONFLICT(email) DO UPDATE SET
           active = 1,
           lang = excluded.lang,
           updated_at = NOW()`,
      [email, lang, token]
    );

    const { rows } = await this.pool.query(
      "SELECT * FROM digest_subscribers WHERE email = $1",
      [email]
    );
    return rows[0] as DigestSubscriberRow;
  }

  async subscribeTelegram(chatId: string, lang: "en" | "zh" = "en"): Promise<DigestSubscriberRow> {
    const token = crypto.randomUUID();
    await this.pool.query(
      `INSERT INTO digest_subscribers (telegram_chat_id, lang, unsubscribe_token)
         VALUES ($1, $2, $3)
         ON CONFLICT(telegram_chat_id) DO UPDATE SET
           active = 1,
           lang = excluded.lang,
           updated_at = NOW()`,
      [chatId, lang, token]
    );

    const { rows } = await this.pool.query(
      "SELECT * FROM digest_subscribers WHERE telegram_chat_id = $1",
      [chatId]
    );
    return rows[0] as DigestSubscriberRow;
  }

  async unsubscribeByToken(token: string): Promise<boolean> {
    const result = await this.pool.query(
      "UPDATE digest_subscribers SET active = 0, updated_at = NOW() WHERE unsubscribe_token = $1",
      [token]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async unsubscribeEmail(email: string): Promise<boolean> {
    const result = await this.pool.query(
      "UPDATE digest_subscribers SET active = 0, updated_at = NOW() WHERE email = $1",
      [email]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getActiveSubscribers(lang?: string): Promise<DigestSubscriberRow[]> {
    if (lang) {
      const { rows } = await this.pool.query(
        "SELECT * FROM digest_subscribers WHERE active = 1 AND lang = $1",
        [lang]
      );
      return rows as DigestSubscriberRow[];
    }
    const { rows } = await this.pool.query(
      "SELECT * FROM digest_subscribers WHERE active = 1"
    );
    return rows as DigestSubscriberRow[];
  }

  async getSubscriberCount(): Promise<{ active: number; total: number }> {
    const { rows } = await this.pool.query(
      "SELECT COUNT(*) as total, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active FROM digest_subscribers"
    );
    const row = rows[0] as { total: string; active: string | null };
    return { active: Number(row.active ?? 0), total: Number(row.total) };
  }

  async saveDigest(digest: {
    lang: string;
    subject: string;
    contentHtml: string;
    contentTelegram: string;
    emailsSent: number;
    telegramsSent: number;
  }): Promise<number> {
    const { rows } = await this.pool.query(
      `INSERT INTO digest_history (lang, subject, content_html, content_telegram, emails_sent, telegrams_sent)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
      [
        digest.lang,
        digest.subject,
        digest.contentHtml,
        digest.contentTelegram,
        digest.emailsSent,
        digest.telegramsSent,
      ]
    );
    return rows[0].id as number;
  }

  async getRecentDigests(limit: number = 10): Promise<DigestHistoryRow[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM digest_history ORDER BY generated_at DESC LIMIT $1",
      [limit]
    );
    return rows as DigestHistoryRow[];
  }

  async getLatestDigest(lang: string): Promise<DigestHistoryRow | undefined> {
    const { rows } = await this.pool.query(
      "SELECT * FROM digest_history WHERE lang = $1 ORDER BY generated_at DESC LIMIT 1",
      [lang]
    );
    return rows[0] as DigestHistoryRow | undefined;
  }
}
