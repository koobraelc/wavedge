import type Database from "better-sqlite3";
import { getDatabase } from "./database.js";

export interface WhaleTransactionRow {
  id: number;
  token_symbol: string;
  transaction_hash: string;
  from_address: string | null;
  to_address: string | null;
  amount: number;
  amount_usd: number;
  blockchain: string;
  transaction_type: string;
  fetched_at: string;
}

export interface WhaleTransactionInsert {
  tokenSymbol: string;
  transactionHash: string;
  fromAddress?: string | null;
  toAddress?: string | null;
  amount: number;
  amountUsd: number;
  blockchain: string;
  transactionType?: string;
}

export class WhaleRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  insert(tx: WhaleTransactionInsert): number {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO whale_transactions
          (token_symbol, transaction_hash, from_address, to_address, amount, amount_usd, blockchain, transaction_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        tx.tokenSymbol.toUpperCase(),
        tx.transactionHash,
        tx.fromAddress ?? null,
        tx.toAddress ?? null,
        tx.amount,
        tx.amountUsd,
        tx.blockchain,
        tx.transactionType ?? "transfer"
      );
    return result.changes;
  }

  insertBatch(txs: WhaleTransactionInsert[]): number {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO whale_transactions
        (token_symbol, transaction_hash, from_address, to_address, amount, amount_usd, blockchain, transaction_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    let count = 0;
    const run = this.db.transaction(() => {
      for (const tx of txs) {
        const result = stmt.run(
          tx.tokenSymbol.toUpperCase(),
          tx.transactionHash,
          tx.fromAddress ?? null,
          tx.toAddress ?? null,
          tx.amount,
          tx.amountUsd,
          tx.blockchain,
          tx.transactionType ?? "transfer"
        );
        count += result.changes;
      }
    });
    run();
    return count;
  }

  /** Get recent whale transactions for a token within the last N hours. */
  getRecent(tokenSymbol: string, hours: number = 24): WhaleTransactionRow[] {
    return this.db
      .prepare(
        `SELECT * FROM whale_transactions
         WHERE token_symbol = ? AND fetched_at >= datetime('now', ?)
         ORDER BY amount_usd DESC`
      )
      .all(tokenSymbol.toUpperCase(), `-${hours} hours`) as WhaleTransactionRow[];
  }

  /** Get total USD volume of whale transactions for a token within a time window. */
  getVolumeUsd(tokenSymbol: string, hours: number = 1): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(amount_usd), 0) as total
         FROM whale_transactions
         WHERE token_symbol = ? AND fetched_at >= datetime('now', ?)`
      )
      .get(tokenSymbol.toUpperCase(), `-${hours} hours`) as { total: number };
    return row.total;
  }

  /** Get count of whale transactions for a token within a time window. */
  getCount(tokenSymbol: string, hours: number = 1): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count
         FROM whale_transactions
         WHERE token_symbol = ? AND fetched_at >= datetime('now', ?)`
      )
      .get(tokenSymbol.toUpperCase(), `-${hours} hours`) as { count: number };
    return row.count;
  }

  /** Get latest whale transactions across all tokens. */
  getLatestAll(limit: number = 50): WhaleTransactionRow[] {
    return this.db
      .prepare(
        `SELECT * FROM whale_transactions
         ORDER BY fetched_at DESC
         LIMIT ?`
      )
      .all(limit) as WhaleTransactionRow[];
  }

  /** Get whale activity summary per token (last N hours). */
  getSummary(hours: number = 24): { token_symbol: string; tx_count: number; total_usd: number }[] {
    return this.db
      .prepare(
        `SELECT token_symbol, COUNT(*) as tx_count, SUM(amount_usd) as total_usd
         FROM whale_transactions
         WHERE fetched_at >= datetime('now', ?)
         GROUP BY token_symbol
         ORDER BY total_usd DESC`
      )
      .all(`-${hours} hours`) as { token_symbol: string; tx_count: number; total_usd: number }[];
  }
}
