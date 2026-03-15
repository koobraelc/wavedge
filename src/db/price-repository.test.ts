import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase } from "./database.js";
import { PriceRepository, type PriceInsert } from "./price-repository.js";
import type Database from "better-sqlite3";

function makePriceInsert(overrides?: Partial<PriceInsert>): PriceInsert {
  return {
    tokenId: "bitcoin",
    symbol: "btc",
    name: "Bitcoin",
    priceUsd: 65000,
    marketCap: 1_200_000_000_000,
    totalVolume: 25_000_000_000,
    priceChange24h: 1500,
    priceChangePercentage24h: 2.3,
    circulatingSupply: 19_500_000,
    ...overrides,
  };
}

describe("PriceRepository", () => {
  let db: Database.Database;
  let repo: PriceRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new PriceRepository(db);
  });

  describe("upsertToken", () => {
    it("should insert a new token", () => {
      repo.upsertToken("bitcoin", "BTC", "Bitcoin");
      expect(repo.getTokenCount()).toBe(1);
      const token = repo.getTokenBySymbol("btc");
      expect(token).toBeDefined();
      expect(token!.id).toBe("bitcoin");
      expect(token!.symbol).toBe("btc");
      expect(token!.name).toBe("Bitcoin");
    });

    it("should update existing token on conflict", () => {
      repo.upsertToken("bitcoin", "BTC", "Bitcoin");
      repo.upsertToken("bitcoin", "BTC", "Bitcoin Updated");
      expect(repo.getTokenCount()).toBe(1);
      const token = repo.getTokenBySymbol("btc");
      expect(token!.name).toBe("Bitcoin Updated");
    });
  });

  describe("insertPrice", () => {
    it("should insert a price record and create the token", () => {
      repo.insertPrice(makePriceInsert());
      expect(repo.getTokenCount()).toBe(1);
      expect(repo.getPriceCount()).toBe(1);
    });

    it("should handle null fields", () => {
      repo.insertPrice(
        makePriceInsert({
          marketCap: null,
          totalVolume: null,
          priceChange24h: null,
          priceChangePercentage24h: null,
          circulatingSupply: null,
        })
      );
      expect(repo.getPriceCount()).toBe(1);
    });
  });

  describe("insertPricesBatch", () => {
    it("should insert multiple price records in a transaction", () => {
      const inserts: PriceInsert[] = [
        makePriceInsert({ tokenId: "bitcoin", symbol: "btc", name: "Bitcoin" }),
        makePriceInsert({ tokenId: "ethereum", symbol: "eth", name: "Ethereum", priceUsd: 3500 }),
        makePriceInsert({ tokenId: "solana", symbol: "sol", name: "Solana", priceUsd: 150 }),
      ];

      const count = repo.insertPricesBatch(inserts);
      expect(count).toBe(3);
      expect(repo.getTokenCount()).toBe(3);
      expect(repo.getPriceCount()).toBe(3);
    });

    it("should handle empty batch", () => {
      const count = repo.insertPricesBatch([]);
      expect(count).toBe(0);
    });
  });

  describe("getLatestPrices", () => {
    it("should return latest prices for all tokens", () => {
      repo.insertPricesBatch([
        makePriceInsert({ tokenId: "bitcoin", symbol: "btc", name: "Bitcoin", priceUsd: 65000 }),
        makePriceInsert({ tokenId: "ethereum", symbol: "eth", name: "Ethereum", priceUsd: 3500 }),
      ]);

      const prices = repo.getLatestPrices();
      expect(prices).toHaveLength(2);
      expect(prices[0].price_usd).toBeDefined();
    });
  });

  describe("getPriceHistory", () => {
    it("should return price history for a token", () => {
      repo.insertPrice(makePriceInsert());
      const history = repo.getPriceHistory("bitcoin");
      expect(history).toHaveLength(1);
      expect(history[0].token_id).toBe("bitcoin");
    });

    it("should respect limit parameter", () => {
      repo.insertPrice(makePriceInsert());
      const history = repo.getPriceHistory("bitcoin", 1);
      expect(history).toHaveLength(1);
    });
  });

  describe("getTokenBySymbol", () => {
    it("should find token by symbol (case insensitive)", () => {
      repo.upsertToken("bitcoin", "BTC", "Bitcoin");
      const token = repo.getTokenBySymbol("BTC");
      expect(token).toBeDefined();
      expect(token!.id).toBe("bitcoin");
    });

    it("should return undefined for unknown symbol", () => {
      const token = repo.getTokenBySymbol("xyz");
      expect(token).toBeUndefined();
    });
  });
});
