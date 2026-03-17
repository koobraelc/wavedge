import { Pool } from "@neondatabase/serverless";
import { getPool } from "./database";

export interface AlertPreferencesRow {
  id: number;
  user_id: string;
  token_symbols: string; // JSON array
  channels: string; // JSON array
  sensitivity: string;
  news_frequency_threshold: number;
  news_window_minutes: number;
  price_change_threshold: number;
  volume_change_threshold: number;
  sentiment_change_threshold: number;
  whale_transaction_threshold: number;
  min_signals: number;
  enabled: number;
  telegram_chat_id: string | null;
  email_address: string | null;
  created_at: string;
  updated_at: string;
}

export interface AlertPreferencesInsert {
  userId?: string;
  tokenSymbols?: string[];
  channels?: string[];
  sensitivity?: "low" | "medium" | "high";
  newsFrequencyThreshold?: number;
  newsWindowMinutes?: number;
  priceChangeThreshold?: number;
  volumeChangeThreshold?: number;
  sentimentChangeThreshold?: number;
  whaleTransactionThreshold?: number;
  minSignals?: number;
  enabled?: boolean;
  telegramChatId?: string | null;
  emailAddress?: string | null;
}

export interface TriggeredAlertRow {
  id: number;
  user_id: string;
  token_symbol: string;
  signals: string; // JSON
  signal_count: number;
  summary: string;
  delivered_channels: string; // JSON array
  created_at: string;
}

export interface TriggeredAlertInsert {
  userId: string;
  tokenSymbol: string;
  signals: object;
  signalCount: number;
  summary: string;
  deliveredChannels: string[];
}

const SENSITIVITY_PRESETS: Record<string, { priceChange: number; volumeChange: number; newsFrequency: number; sentimentChange: number; whaleThreshold: number }> = {
  low: { priceChange: 8.0, volumeChange: 200.0, newsFrequency: 5, sentimentChange: 50, whaleThreshold: 10_000_000 },
  medium: { priceChange: 5.0, volumeChange: 100.0, newsFrequency: 3, sentimentChange: 30, whaleThreshold: 1_000_000 },
  high: { priceChange: 2.0, volumeChange: 50.0, newsFrequency: 2, sentimentChange: 15, whaleThreshold: 500_000 },
};

export class AlertRepository {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || getPool();
  }

  async getPreferences(userId: string = "default"): Promise<AlertPreferencesRow | undefined> {
    const { rows } = await this.pool.query(
      "SELECT * FROM alert_preferences WHERE user_id = $1",
      [userId]
    );
    return rows[0] as AlertPreferencesRow | undefined;
  }

  async getAllEnabledPreferences(): Promise<AlertPreferencesRow[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM alert_preferences WHERE enabled = 1"
    );
    return rows as AlertPreferencesRow[];
  }

  async upsertPreferences(insert: AlertPreferencesInsert): Promise<AlertPreferencesRow> {
    const userId = insert.userId ?? "default";
    const existing = await this.getPreferences(userId);

    let priceThreshold = insert.priceChangeThreshold;
    let volumeThreshold = insert.volumeChangeThreshold;
    let newsThreshold = insert.newsFrequencyThreshold;
    let sentimentThreshold = insert.sentimentChangeThreshold;
    let whaleThreshold = insert.whaleTransactionThreshold;
    if (insert.sensitivity && !existing) {
      const preset = SENSITIVITY_PRESETS[insert.sensitivity];
      priceThreshold = priceThreshold ?? preset.priceChange;
      volumeThreshold = volumeThreshold ?? preset.volumeChange;
      newsThreshold = newsThreshold ?? preset.newsFrequency;
      sentimentThreshold = sentimentThreshold ?? preset.sentimentChange;
      whaleThreshold = whaleThreshold ?? preset.whaleThreshold;
    }

    if (existing) {
      await this.pool.query(
        `UPDATE alert_preferences SET
            token_symbols = $1,
            channels = $2,
            sensitivity = $3,
            news_frequency_threshold = $4,
            news_window_minutes = $5,
            price_change_threshold = $6,
            volume_change_threshold = $7,
            sentiment_change_threshold = $8,
            whale_transaction_threshold = $9,
            min_signals = $10,
            enabled = $11,
            telegram_chat_id = $12,
            email_address = $13,
            updated_at = NOW()
          WHERE user_id = $14`,
        [
          JSON.stringify(insert.tokenSymbols ?? JSON.parse(existing.token_symbols)),
          JSON.stringify(insert.channels ?? JSON.parse(existing.channels)),
          insert.sensitivity ?? existing.sensitivity,
          newsThreshold ?? existing.news_frequency_threshold,
          insert.newsWindowMinutes ?? existing.news_window_minutes,
          priceThreshold ?? existing.price_change_threshold,
          volumeThreshold ?? existing.volume_change_threshold,
          sentimentThreshold ?? existing.sentiment_change_threshold,
          whaleThreshold ?? existing.whale_transaction_threshold,
          insert.minSignals ?? existing.min_signals,
          insert.enabled !== undefined ? (insert.enabled ? 1 : 0) : existing.enabled,
          insert.telegramChatId !== undefined ? insert.telegramChatId : existing.telegram_chat_id,
          insert.emailAddress !== undefined ? insert.emailAddress : existing.email_address,
          userId,
        ]
      );
    } else {
      await this.pool.query(
        `INSERT INTO alert_preferences
            (user_id, token_symbols, channels, sensitivity, news_frequency_threshold,
             news_window_minutes, price_change_threshold, volume_change_threshold,
             sentiment_change_threshold, whale_transaction_threshold, min_signals, enabled, telegram_chat_id, email_address)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          userId,
          JSON.stringify(insert.tokenSymbols ?? []),
          JSON.stringify(insert.channels ?? ["web"]),
          insert.sensitivity ?? "medium",
          newsThreshold ?? 3,
          insert.newsWindowMinutes ?? 60,
          priceThreshold ?? 5.0,
          volumeThreshold ?? 100.0,
          sentimentThreshold ?? 30.0,
          whaleThreshold ?? 1_000_000,
          insert.minSignals ?? 2,
          insert.enabled !== undefined ? (insert.enabled ? 1 : 0) : 1,
          insert.telegramChatId ?? null,
          insert.emailAddress ?? null,
        ]
      );
    }

    return (await this.getPreferences(userId))!;
  }

  async insertTriggeredAlert(insert: TriggeredAlertInsert): Promise<number> {
    const { rows } = await this.pool.query(
      `INSERT INTO triggered_alerts (user_id, token_symbol, signals, signal_count, summary, delivered_channels)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
      [
        insert.userId,
        insert.tokenSymbol,
        JSON.stringify(insert.signals),
        insert.signalCount,
        insert.summary,
        JSON.stringify(insert.deliveredChannels),
      ]
    );
    return rows[0].id as number;
  }

  async getRecentAlerts(userId: string, hours: number = 24): Promise<TriggeredAlertRow[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM triggered_alerts
         WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '${hours} hours'
         ORDER BY created_at DESC`,
      [userId]
    );
    return rows as TriggeredAlertRow[];
  }

  async insertMissedAlert(insert: TriggeredAlertInsert): Promise<number> {
    const { rows } = await this.pool.query(
      `INSERT INTO missed_alerts (user_id, token_symbol, signals, signal_count, summary)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
      [
        insert.userId,
        insert.tokenSymbol,
        JSON.stringify(insert.signals),
        insert.signalCount,
        insert.summary,
      ]
    );
    return rows[0].id as number;
  }

  async getDailyMissedAlertCount(userId: string): Promise<number> {
    const today = new Date().toISOString().split("T")[0];
    const { rows } = await this.pool.query(
      "SELECT COUNT(*) as count FROM missed_alerts WHERE user_id = $1 AND created_at::date = $2",
      [userId, today]
    );
    return Number(rows[0].count);
  }

  async getRecentMissedAlerts(userId: string, hours: number = 24): Promise<TriggeredAlertRow[]> {
    const { rows } = await this.pool.query(
      `SELECT id, user_id, token_symbol, signals, signal_count, summary, '[]' as delivered_channels, created_at
         FROM missed_alerts
         WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '${hours} hours'
         ORDER BY created_at DESC`,
      [userId]
    );
    return rows as TriggeredAlertRow[];
  }

  /** Check if we already alerted for this token recently (dedup window) */
  async hasRecentAlert(userId: string, tokenSymbol: string, minutes: number = 30): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*) as count FROM triggered_alerts
         WHERE user_id = $1 AND token_symbol = $2 AND created_at >= NOW() - INTERVAL '${minutes} minutes'`,
      [userId, tokenSymbol]
    );
    return Number(rows[0].count) > 0;
  }
}
