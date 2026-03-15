import type Database from "better-sqlite3";
import { getDatabase } from "./database.js";

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
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  upsertToken(id: string, symbol: string, name: string): void {
    this.db
      .prepare(
        `INSERT INTO tokens (id, symbol, name) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET symbol = excluded.symbol, name = excluded.name, updated_at = datetime('now')`
      )
      .run(id, symbol.toLowerCase(), name);
  }

  insertPrice(data: PriceInsert): void {
    this.upsertToken(data.tokenId, data.symbol, data.name);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO prices (token_id, price_usd, market_cap, total_volume, price_change_24h, price_change_percentage_24h, circulating_supply)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        data.tokenId,
        data.priceUsd,
        data.marketCap,
        data.totalVolume,
        data.priceChange24h,
        data.priceChangePercentage24h,
        data.circulatingSupply
      );
  }

  insertPricesBatch(prices: PriceInsert[]): number {
    const insertMany = this.db.transaction((items: PriceInsert[]) => {
      let count = 0;
      for (const item of items) {
        this.upsertToken(item.tokenId, item.symbol, item.name);
        const result = this.db
          .prepare(
            `INSERT OR IGNORE INTO prices (token_id, price_usd, market_cap, total_volume, price_change_24h, price_change_percentage_24h, circulating_supply)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            item.tokenId,
            item.priceUsd,
            item.marketCap,
            item.totalVolume,
            item.priceChange24h,
            item.priceChangePercentage24h,
            item.circulatingSupply
          );
        count += result.changes;
      }
      return count;
    });
    return insertMany(prices);
  }

  getLatestPrices(): (TokenRow & PriceRow)[] {
    return this.db
      .prepare(
        `SELECT t.id, t.symbol, t.name, p.price_usd, p.market_cap, p.total_volume,
                p.price_change_24h, p.price_change_percentage_24h, p.circulating_supply, p.fetched_at
         FROM tokens t
         JOIN prices p ON p.token_id = t.id
         WHERE p.fetched_at = (SELECT MAX(p2.fetched_at) FROM prices p2 WHERE p2.token_id = t.id)
         ORDER BY p.market_cap DESC`
      )
      .all() as (TokenRow & PriceRow)[];
  }

  getPriceHistory(tokenId: string, limit: number = 288): PriceRow[] {
    return this.db
      .prepare(
        `SELECT * FROM prices WHERE token_id = ? ORDER BY fetched_at DESC LIMIT ?`
      )
      .all(tokenId, limit) as PriceRow[];
  }

  getTokenBySymbol(symbol: string): TokenRow | undefined {
    return this.db
      .prepare(`SELECT * FROM tokens WHERE symbol = ?`)
      .get(symbol.toLowerCase()) as TokenRow | undefined;
  }

  getTokenCount(): number {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM tokens`).get() as { count: number };
    return row.count;
  }

  getPriceCount(): number {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM prices`).get() as { count: number };
    return row.count;
  }
}
