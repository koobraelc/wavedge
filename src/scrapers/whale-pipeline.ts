import { WhaleClient, type WhaleTransactionData } from "./whale-client.js";
import { WhaleRepository, type WhaleTransactionInsert } from "../db/whale-repository.js";
import type Database from "better-sqlite3";
import { getDatabase } from "../db/database.js";

export interface WhalePipelineResult {
  success: boolean;
  transactionsIngested: number;
  source: "whale_alert" | "volume_derived";
  errors: string[];
  durationMs: number;
}

/**
 * Whale transaction pipeline.
 *
 * Strategy:
 *  1. If WHALE_ALERT_API_KEY is set, fetch real whale transactions.
 *  2. Otherwise, derive whale-like activity from volume spikes in our price data.
 *     This gives a usable signal without external API dependency.
 */
export class WhalePipeline {
  private client: WhaleClient;
  private repo: WhaleRepository;
  private db: Database.Database;

  constructor(client?: WhaleClient, repo?: WhaleRepository, db?: Database.Database) {
    this.db = db || getDatabase();
    this.client = client || new WhaleClient();
    this.repo = repo || new WhaleRepository(this.db);
  }

  async ingest(): Promise<WhalePipelineResult> {
    const start = Date.now();
    const errors: string[] = [];

    try {
      if (this.client.isConfigured) {
        return await this.ingestFromWhaleAlert(start, errors);
      }
      return this.ingestFromVolume(start, errors);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      console.error(`Whale pipeline error: ${message}`);
      return { success: false, transactionsIngested: 0, source: "volume_derived", errors, durationMs: Date.now() - start };
    }
  }

  private async ingestFromWhaleAlert(start: number, errors: string[]): Promise<WhalePipelineResult> {
    const transactions = await this.client.fetchRecent();

    const inserts: WhaleTransactionInsert[] = transactions.map((tx) => ({
      tokenSymbol: tx.tokenSymbol,
      transactionHash: tx.transactionHash,
      fromAddress: tx.fromAddress,
      toAddress: tx.toAddress,
      amount: tx.amount,
      amountUsd: tx.amountUsd,
      blockchain: tx.blockchain,
      transactionType: tx.transactionType,
    }));

    const count = this.repo.insertBatch(inserts);
    console.log(`Whale pipeline (API): ingested ${count} transactions in ${Date.now() - start}ms`);

    return { success: true, transactionsIngested: count, source: "whale_alert", errors, durationMs: Date.now() - start };
  }

  /**
   * Derive whale-like activity from volume anomalies in our price data.
   * When a token's volume spikes significantly vs its average, we simulate a whale event.
   */
  private ingestFromVolume(start: number, errors: string[]): WhalePipelineResult {
    const rows = this.db
      .prepare(
        `SELECT t.symbol, p.total_volume, p.price_usd, p.fetched_at
         FROM prices p
         JOIN tokens t ON t.id = p.token_id
         WHERE p.fetched_at >= datetime('now', '-30 minutes')
           AND p.total_volume IS NOT NULL AND p.total_volume > 0
         ORDER BY p.fetched_at DESC`
      )
      .all() as { symbol: string; total_volume: number; price_usd: number; fetched_at: string }[];

    // Group by symbol, take latest
    const latestBySymbol = new Map<string, { total_volume: number; price_usd: number; fetched_at: string }>();
    for (const row of rows) {
      const sym = row.symbol.toUpperCase();
      if (!latestBySymbol.has(sym)) {
        latestBySymbol.set(sym, row);
      }
    }

    // Compare to 24h average volume
    const inserts: WhaleTransactionInsert[] = [];

    for (const [symbol, latest] of latestBySymbol) {
      const avgRow = this.db
        .prepare(
          `SELECT AVG(p.total_volume) as avg_vol
           FROM prices p
           JOIN tokens t ON t.id = p.token_id
           WHERE t.symbol = ? AND p.fetched_at >= datetime('now', '-24 hours')
             AND p.total_volume IS NOT NULL AND p.total_volume > 0`
        )
        .get(symbol.toLowerCase()) as { avg_vol: number | null };

      if (!avgRow?.avg_vol || avgRow.avg_vol === 0) continue;

      const ratio = latest.total_volume / avgRow.avg_vol;

      // Volume spike > 1.3x average suggests whale activity (lowered from 2x to capture more events)
      if (ratio >= 1.3) {
        const estimatedWhaleUsd = latest.total_volume * 0.1; // Estimate 10% is whale-driven
        if (estimatedWhaleUsd < 100_000) continue; // Skip small volumes (lowered from 500K)

        const hash = `vol-derived-${symbol}-${latest.fetched_at.replace(/[^0-9]/g, "")}`;
        inserts.push({
          tokenSymbol: symbol,
          transactionHash: hash,
          fromAddress: null,
          toAddress: null,
          amount: estimatedWhaleUsd / latest.price_usd,
          amountUsd: estimatedWhaleUsd,
          blockchain: "derived",
          transactionType: "volume_spike",
        });
      }
    }

    // If no spikes detected, generate entries for top-volume tokens so pages aren't empty
    if (inserts.length === 0) {
      const topVolume = this.db
        .prepare(
          `SELECT t.symbol, p.total_volume, p.price_usd, p.fetched_at
           FROM prices p
           JOIN tokens t ON t.id = p.token_id
           WHERE p.fetched_at >= datetime('now', '-30 minutes')
             AND p.total_volume IS NOT NULL AND p.total_volume > 0
           ORDER BY p.total_volume DESC
           LIMIT 10`
        )
        .all() as { symbol: string; total_volume: number; price_usd: number; fetched_at: string }[];

      const seen = new Set<string>();
      for (const row of topVolume) {
        const sym = row.symbol.toUpperCase();
        if (seen.has(sym)) continue;
        seen.add(sym);

        const estimatedWhaleUsd = row.total_volume * 0.05;
        if (estimatedWhaleUsd < 50_000) continue;

        const hash = `vol-top-${sym}-${row.fetched_at.replace(/[^0-9]/g, "")}`;
        inserts.push({
          tokenSymbol: sym,
          transactionHash: hash,
          fromAddress: null,
          toAddress: null,
          amount: estimatedWhaleUsd / row.price_usd,
          amountUsd: estimatedWhaleUsd,
          blockchain: "derived",
          transactionType: "high_volume",
        });
      }
    }

    const count = this.repo.insertBatch(inserts);
    console.log(`Whale pipeline (volume-derived): ingested ${count} events in ${Date.now() - start}ms`);

    return { success: true, transactionsIngested: count, source: "volume_derived", errors, durationMs: Date.now() - start };
  }
}
