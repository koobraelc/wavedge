import type Database from "better-sqlite3";
import { getDatabase } from "./database.js";

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

const SENSITIVITY_PRESETS: Record<string, { priceChange: number; volumeChange: number; newsFrequency: number }> = {
  low: { priceChange: 8.0, volumeChange: 200.0, newsFrequency: 5 },
  medium: { priceChange: 5.0, volumeChange: 100.0, newsFrequency: 3 },
  high: { priceChange: 2.0, volumeChange: 50.0, newsFrequency: 2 },
};

export class AlertRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  getPreferences(userId: string = "default"): AlertPreferencesRow | undefined {
    return this.db
      .prepare("SELECT * FROM alert_preferences WHERE user_id = ?")
      .get(userId) as AlertPreferencesRow | undefined;
  }

  getAllEnabledPreferences(): AlertPreferencesRow[] {
    return this.db
      .prepare("SELECT * FROM alert_preferences WHERE enabled = 1")
      .all() as AlertPreferencesRow[];
  }

  upsertPreferences(insert: AlertPreferencesInsert): AlertPreferencesRow {
    const userId = insert.userId ?? "default";
    const existing = this.getPreferences(userId);

    // Apply sensitivity presets if sensitivity changed
    let priceThreshold = insert.priceChangeThreshold;
    let volumeThreshold = insert.volumeChangeThreshold;
    let newsThreshold = insert.newsFrequencyThreshold;
    if (insert.sensitivity && !existing) {
      const preset = SENSITIVITY_PRESETS[insert.sensitivity];
      priceThreshold = priceThreshold ?? preset.priceChange;
      volumeThreshold = volumeThreshold ?? preset.volumeChange;
      newsThreshold = newsThreshold ?? preset.newsFrequency;
    }

    if (existing) {
      // Partial update
      this.db
        .prepare(
          `UPDATE alert_preferences SET
            token_symbols = ?,
            channels = ?,
            sensitivity = ?,
            news_frequency_threshold = ?,
            news_window_minutes = ?,
            price_change_threshold = ?,
            volume_change_threshold = ?,
            min_signals = ?,
            enabled = ?,
            telegram_chat_id = ?,
            email_address = ?,
            updated_at = datetime('now')
          WHERE user_id = ?`
        )
        .run(
          JSON.stringify(insert.tokenSymbols ?? JSON.parse(existing.token_symbols)),
          JSON.stringify(insert.channels ?? JSON.parse(existing.channels)),
          insert.sensitivity ?? existing.sensitivity,
          newsThreshold ?? existing.news_frequency_threshold,
          insert.newsWindowMinutes ?? existing.news_window_minutes,
          priceThreshold ?? existing.price_change_threshold,
          volumeThreshold ?? existing.volume_change_threshold,
          insert.minSignals ?? existing.min_signals,
          insert.enabled !== undefined ? (insert.enabled ? 1 : 0) : existing.enabled,
          insert.telegramChatId !== undefined ? insert.telegramChatId : existing.telegram_chat_id,
          insert.emailAddress !== undefined ? insert.emailAddress : existing.email_address,
          userId
        );
    } else {
      this.db
        .prepare(
          `INSERT INTO alert_preferences
            (user_id, token_symbols, channels, sensitivity, news_frequency_threshold,
             news_window_minutes, price_change_threshold, volume_change_threshold,
             min_signals, enabled, telegram_chat_id, email_address)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          userId,
          JSON.stringify(insert.tokenSymbols ?? []),
          JSON.stringify(insert.channels ?? ["web"]),
          insert.sensitivity ?? "medium",
          newsThreshold ?? 3,
          insert.newsWindowMinutes ?? 60,
          priceThreshold ?? 5.0,
          volumeThreshold ?? 100.0,
          insert.minSignals ?? 2,
          insert.enabled !== undefined ? (insert.enabled ? 1 : 0) : 1,
          insert.telegramChatId ?? null,
          insert.emailAddress ?? null
        );
    }

    return this.getPreferences(userId)!;
  }

  insertTriggeredAlert(insert: TriggeredAlertInsert): number {
    const result = this.db
      .prepare(
        `INSERT INTO triggered_alerts (user_id, token_symbol, signals, signal_count, summary, delivered_channels)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        insert.userId,
        insert.tokenSymbol,
        JSON.stringify(insert.signals),
        insert.signalCount,
        insert.summary,
        JSON.stringify(insert.deliveredChannels)
      );
    return result.lastInsertRowid as number;
  }

  getRecentAlerts(userId: string, hours: number = 24): TriggeredAlertRow[] {
    return this.db
      .prepare(
        `SELECT * FROM triggered_alerts
         WHERE user_id = ? AND created_at >= datetime('now', ?)
         ORDER BY created_at DESC`
      )
      .all(userId, `-${hours} hours`) as TriggeredAlertRow[];
  }

  insertMissedAlert(insert: TriggeredAlertInsert): number {
    const result = this.db
      .prepare(
        `INSERT INTO missed_alerts (user_id, token_symbol, signals, signal_count, summary)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        insert.userId,
        insert.tokenSymbol,
        JSON.stringify(insert.signals),
        insert.signalCount,
        insert.summary
      );
    return result.lastInsertRowid as number;
  }

  getDailyMissedAlertCount(userId: string): number {
    const today = new Date().toISOString().split("T")[0];
    const result = this.db
      .prepare(
        "SELECT COUNT(*) as count FROM missed_alerts WHERE user_id = ? AND date(created_at) = ?"
      )
      .get(userId, today) as { count: number };
    return result.count;
  }

  getRecentMissedAlerts(userId: string, hours: number = 24): TriggeredAlertRow[] {
    return this.db
      .prepare(
        `SELECT id, user_id, token_symbol, signals, signal_count, summary, '[]' as delivered_channels, created_at
         FROM missed_alerts
         WHERE user_id = ? AND created_at >= datetime('now', ?)
         ORDER BY created_at DESC`
      )
      .all(userId, `-${hours} hours`) as TriggeredAlertRow[];
  }

  /** Check if we already alerted for this token recently (dedup window) */
  hasRecentAlert(userId: string, tokenSymbol: string, minutes: number = 30): boolean {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM triggered_alerts
         WHERE user_id = ? AND token_symbol = ? AND created_at >= datetime('now', ?)`
      )
      .get(userId, tokenSymbol, `-${minutes} minutes`) as { count: number };
    return row.count > 0;
  }
}
