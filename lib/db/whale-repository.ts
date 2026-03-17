import { Pool } from "@neondatabase/serverless";
import { getPool } from "./database";

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
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || getPool();
  }

  async insert(tx: WhaleTransactionInsert): Promise<number> {
    const result = await this.pool.query(
      `INSERT INTO whale_transactions
        (token_symbol, transaction_hash, from_address, to_address, amount, amount_usd, blockchain, transaction_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT(transaction_hash) DO NOTHING`,
      [
        tx.tokenSymbol.toUpperCase(),
        tx.transactionHash,
        tx.fromAddress ?? null,
        tx.toAddress ?? null,
        tx.amount,
        tx.amountUsd,
        tx.blockchain,
        tx.transactionType ?? "transfer",
      ]
    );
    return result.rowCount ?? 0;
  }

  async insertBatch(txs: WhaleTransactionInsert[]): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      let count = 0;
      for (const tx of txs) {
        const result = await client.query(
          `INSERT INTO whale_transactions
            (token_symbol, transaction_hash, from_address, to_address, amount, amount_usd, blockchain, transaction_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT(transaction_hash) DO NOTHING`,
          [
            tx.tokenSymbol.toUpperCase(),
            tx.transactionHash,
            tx.fromAddress ?? null,
            tx.toAddress ?? null,
            tx.amount,
            tx.amountUsd,
            tx.blockchain,
            tx.transactionType ?? "transfer",
          ]
        );
        count += result.rowCount ?? 0;
      }
      await client.query("COMMIT");
      return count;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  /** Get recent whale transactions for a token within the last N hours. */
  async getRecent(tokenSymbol: string, hours: number = 24): Promise<WhaleTransactionRow[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM whale_transactions
       WHERE token_symbol = $1 AND fetched_at >= NOW() - INTERVAL '${hours} hours'
       ORDER BY amount_usd DESC`,
      [tokenSymbol.toUpperCase()]
    );
    return rows;
  }

  /** Get total USD volume of whale transactions for a token within a time window. */
  async getVolumeUsd(tokenSymbol: string, hours: number = 1): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COALESCE(SUM(amount_usd), 0) as total
       FROM whale_transactions
       WHERE token_symbol = $1 AND fetched_at >= NOW() - INTERVAL '${hours} hours'`,
      [tokenSymbol.toUpperCase()]
    );
    return rows[0].total;
  }

  /** Get count of whale transactions for a token within a time window. */
  async getCount(tokenSymbol: string, hours: number = 1): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT COUNT(*) as count
       FROM whale_transactions
       WHERE token_symbol = $1 AND fetched_at >= NOW() - INTERVAL '${hours} hours'`,
      [tokenSymbol.toUpperCase()]
    );
    return rows[0].count;
  }

  /** Get latest whale transactions across all tokens. */
  async getLatestAll(limit: number = 50): Promise<WhaleTransactionRow[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM whale_transactions
       ORDER BY fetched_at DESC
       LIMIT $1`,
      [limit]
    );
    return rows;
  }

  /** Get whale activity summary per token (last N hours). */
  async getSummary(hours: number = 24): Promise<{ token_symbol: string; tx_count: number; total_usd: number }[]> {
    const { rows } = await this.pool.query(
      `SELECT token_symbol, COUNT(*) as tx_count, SUM(amount_usd) as total_usd
       FROM whale_transactions
       WHERE fetched_at >= NOW() - INTERVAL '${hours} hours'
       GROUP BY token_symbol
       ORDER BY total_usd DESC`
    );
    return rows;
  }
}
