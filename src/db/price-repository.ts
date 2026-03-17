import { Pool } from "pg";
import { getPool } from "./database.js";

export interface TokenRow {
  id: string;
  symbol: string;
  name: string;
}

export interface PriceRow {
  id: number;
  token_id: string;
  price_usd: number;
  market_cap: number | null;
  total_volume: number | null;
  price_change_24h: number | null;
  price_change_percentage_24h: number | null;
  circulating_supply: number | null;
  fetched_at: string;
}

export interface PriceInsert {
  tokenId: string;
  symbol: string;
  name: string;
  priceUsd: number;
  marketCap: number | null;
  totalVolume: number | null;
  priceChange24h: number | null;
  priceChangePercentage24h: number | null;
  circulatingSupply: number | null;
}

export class PriceRepository {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || getPool();
  }

  async upsertToken(id: string, symbol: string, name: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO tokens (id, symbol, name) VALUES ($1, $2, $3)
         ON CONFLICT(id) DO UPDATE SET symbol = excluded.symbol, name = excluded.name, updated_at = NOW()`,
      [id, symbol.toLowerCase(), name]
    );
  }

  async insertPrice(data: PriceInsert): Promise<void> {
    await this.upsertToken(data.tokenId, data.symbol, data.name);
    await this.pool.query(
      `INSERT INTO prices (token_id, price_usd, market_cap, total_volume, price_change_24h, price_change_percentage_24h, circulating_supply)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
      [
        data.tokenId,
        data.priceUsd,
        data.marketCap,
        data.totalVolume,
        data.priceChange24h,
        data.priceChangePercentage24h,
        data.circulatingSupply,
      ]
    );
  }

  async insertPricesBatch(prices: PriceInsert[]): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      let count = 0;
      for (const item of prices) {
        await client.query(
          `INSERT INTO tokens (id, symbol, name) VALUES ($1, $2, $3)
           ON CONFLICT(id) DO UPDATE SET symbol = excluded.symbol, name = excluded.name, updated_at = NOW()`,
          [item.tokenId, item.symbol.toLowerCase(), item.name]
        );
        const result = await client.query(
          `INSERT INTO prices (token_id, price_usd, market_cap, total_volume, price_change_24h, price_change_percentage_24h, circulating_supply)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING`,
          [
            item.tokenId,
            item.priceUsd,
            item.marketCap,
            item.totalVolume,
            item.priceChange24h,
            item.priceChangePercentage24h,
            item.circulatingSupply,
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

  async getLatestPrices(): Promise<(TokenRow & PriceRow)[]> {
    const { rows } = await this.pool.query(
      `SELECT t.id, t.symbol, t.name, p.price_usd, p.market_cap, p.total_volume,
                p.price_change_24h, p.price_change_percentage_24h, p.circulating_supply, p.fetched_at
         FROM tokens t
         JOIN (
           SELECT token_id, MAX(fetched_at) as max_fetched
           FROM prices GROUP BY token_id
         ) latest ON latest.token_id = t.id
         JOIN prices p ON p.token_id = latest.token_id AND p.fetched_at = latest.max_fetched
         ORDER BY p.market_cap DESC`
    );
    return rows as (TokenRow & PriceRow)[];
  }

  async getPriceHistory(tokenId: string, limit: number = 288): Promise<PriceRow[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM prices WHERE token_id = $1 ORDER BY fetched_at DESC LIMIT $2`,
      [tokenId, limit]
    );
    return rows as PriceRow[];
  }

  /**
   * Find the closest price to a given timestamp for a token symbol.
   * Returns null if no price exists within 6 hours of the target time.
   */
  async getPriceNearTimestamp(symbol: string, timestamp: string): Promise<PriceRow | null> {
    const { rows: tokenRows } = await this.pool.query(
      `SELECT id FROM tokens WHERE symbol = $1`,
      [symbol.toLowerCase()]
    );
    const token = tokenRows[0] as { id: string } | undefined;
    if (!token) return null;

    const { rows } = await this.pool.query(
      `SELECT * FROM prices
         WHERE token_id = $1
           AND ABS(EXTRACT(EPOCH FROM fetched_at) - EXTRACT(EPOCH FROM $2::timestamptz)) <= 21600
         ORDER BY ABS(EXTRACT(EPOCH FROM fetched_at) - EXTRACT(EPOCH FROM $2::timestamptz)) ASC
         LIMIT 1`,
      [token.id, timestamp]
    );

    return (rows[0] as PriceRow | undefined) ?? null;
  }

  async getTokenBySymbol(symbol: string): Promise<TokenRow | undefined> {
    const { rows } = await this.pool.query(
      `SELECT * FROM tokens WHERE symbol = $1`,
      [symbol.toLowerCase()]
    );
    return rows[0] as TokenRow | undefined;
  }

  async getAllTokens(): Promise<TokenRow[]> {
    const { rows } = await this.pool.query(
      `SELECT id, symbol, name FROM tokens ORDER BY symbol ASC`
    );
    return rows as TokenRow[];
  }

  async getTokenCount(): Promise<number> {
    const { rows } = await this.pool.query(`SELECT COUNT(*) as count FROM tokens`);
    return parseInt(rows[0].count, 10);
  }

  async getPriceCount(): Promise<number> {
    const { rows } = await this.pool.query(`SELECT COUNT(*) as count FROM prices`);
    return parseInt(rows[0].count, 10);
  }
}
