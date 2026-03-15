import type Database from "better-sqlite3";
import { AlertRepository, type AlertPreferencesRow } from "../db/alert-repository.js";
import { PriceRepository } from "../db/price-repository.js";
import {
  detectNewsFrequency,
  detectPriceMovement,
  detectVolumeChange,
  type Signal,
} from "./signal-detectors.js";
import { channelRegistry, type AlertPayload } from "./notification-channels.js";

export interface AlertEngineResult {
  checkedTokens: number;
  alertsTriggered: number;
  errors: string[];
}

export class AlertEngine {
  private alertRepo: AlertRepository;
  private priceRepo: PriceRepository;
  private db: Database.Database | undefined;

  constructor(alertRepo: AlertRepository, priceRepo: PriceRepository, db?: Database.Database) {
    this.alertRepo = alertRepo;
    this.priceRepo = priceRepo;
    this.db = db;
  }

  /**
   * Run one check cycle: for each enabled user preference, scan tokens and fire alerts.
   */
  async runCycle(): Promise<AlertEngineResult> {
    const result: AlertEngineResult = { checkedTokens: 0, alertsTriggered: 0, errors: [] };

    const allPrefs = this.alertRepo.getAllEnabledPreferences();
    if (allPrefs.length === 0) return result;

    for (const pref of allPrefs) {
      try {
        const triggered = await this.checkForUser(pref);
        result.alertsTriggered += triggered;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`User ${pref.user_id}: ${msg}`);
      }
    }

    return result;
  }

  private async checkForUser(pref: AlertPreferencesRow): Promise<number> {
    let tokenSymbols: string[] = JSON.parse(pref.token_symbols);

    // If no tokens configured, use top tokens by market cap
    if (tokenSymbols.length === 0) {
      const latestPrices = this.priceRepo.getLatestPrices();
      tokenSymbols = latestPrices.slice(0, 20).map((p) => p.symbol.toUpperCase());
    }

    let triggered = 0;

    for (const symbol of tokenSymbols) {
      // Skip if we already alerted recently for this token (30 min dedup)
      if (this.alertRepo.hasRecentAlert(pref.user_id, symbol, 30)) {
        continue;
      }

      const signals = this.detectSignals(symbol, pref);
      if (signals.length >= pref.min_signals) {
        await this.fireAlert(pref, symbol, signals);
        triggered++;
      }
    }

    return triggered;
  }

  private detectSignals(tokenSymbol: string, pref: AlertPreferencesRow): Signal[] {
    const signals: Signal[] = [];

    const newsSignal = detectNewsFrequency(
      tokenSymbol,
      pref.news_window_minutes,
      pref.news_frequency_threshold,
      this.db
    );
    if (newsSignal) signals.push(newsSignal);

    const priceSignal = detectPriceMovement(
      tokenSymbol,
      pref.price_change_threshold,
      pref.news_window_minutes, // use same lookback as news window
      this.db
    );
    if (priceSignal) signals.push(priceSignal);

    const volumeSignal = detectVolumeChange(
      tokenSymbol,
      pref.volume_change_threshold,
      this.db
    );
    if (volumeSignal) signals.push(volumeSignal);

    return signals;
  }

  private async fireAlert(
    pref: AlertPreferencesRow,
    tokenSymbol: string,
    signals: Signal[]
  ): Promise<void> {
    const summary = this.buildSummary(tokenSymbol, signals);
    const payload: AlertPayload = { tokenSymbol, signals, summary };

    const channels: string[] = JSON.parse(pref.channels);
    const deliveredChannels: string[] = [];

    // Deliver to each configured channel
    for (const channelName of channels) {
      const channel = channelRegistry[channelName];
      if (!channel) continue;

      const config: Record<string, string> = {
        telegram_chat_id: pref.telegram_chat_id || "",
        email_address: pref.email_address || "",
      };

      try {
        const sent = await channel.send(payload, config);
        if (sent) deliveredChannels.push(channelName);
      } catch (err) {
        console.error(`Alert delivery failed for ${channelName}:`, err);
      }
    }

    // Always record the alert
    this.alertRepo.insertTriggeredAlert({
      userId: pref.user_id,
      tokenSymbol,
      signals: signals.map((s) => ({ type: s.type, value: s.value, detail: s.detail })),
      signalCount: signals.length,
      summary,
      deliveredChannels,
    });

    console.log(
      `Alert fired: ${tokenSymbol} (${signals.length} signals) for user ${pref.user_id}, delivered to: ${deliveredChannels.join(", ") || "none"}`
    );
  }

  private buildSummary(tokenSymbol: string, signals: Signal[]): string {
    const parts: string[] = [`${tokenSymbol.toUpperCase()} multi-signal alert:`];
    for (const s of signals) {
      if (s.type === "news_frequency") {
        parts.push(`${s.value} news articles in window`);
      } else if (s.type === "price_movement") {
        const dir = s.value > 0 ? "up" : "down";
        parts.push(`price ${dir} ${Math.abs(s.value).toFixed(2)}%`);
      } else if (s.type === "volume_change") {
        const dir = s.value > 0 ? "up" : "down";
        parts.push(`volume ${dir} ${Math.abs(s.value).toFixed(1)}%`);
      }
    }
    return parts.join(", ");
  }
}
