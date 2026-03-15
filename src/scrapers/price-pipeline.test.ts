import { describe, it, expect, vi, beforeEach } from "vitest";
import { PricePipeline, mapMarketDataToInsert } from "./price-pipeline.js";
import { PriceRepository } from "../db/price-repository.js";
import { CoinGeckoClient, type CoinGeckoMarketData } from "./coingecko-client.js";
import { createTestDatabase } from "../db/database.js";

function makeMockMarketData(overrides?: Partial<CoinGeckoMarketData>): CoinGeckoMarketData {
  return {
    id: "bitcoin",
    symbol: "btc",
    name: "Bitcoin",
    current_price: 65000,
    market_cap: 1_200_000_000_000,
    total_volume: 25_000_000_000,
    price_change_24h: 1500,
    price_change_percentage_24h: 2.3,
    circulating_supply: 19_500_000,
    ...overrides,
  };
}

describe("mapMarketDataToInsert", () => {
  it("should correctly map CoinGecko data to PriceInsert", () => {
    const data = makeMockMarketData();
    const result = mapMarketDataToInsert(data);

    expect(result.tokenId).toBe("bitcoin");
    expect(result.symbol).toBe("btc");
    expect(result.name).toBe("Bitcoin");
    expect(result.priceUsd).toBe(65000);
    expect(result.marketCap).toBe(1_200_000_000_000);
    expect(result.totalVolume).toBe(25_000_000_000);
    expect(result.priceChange24h).toBe(1500);
    expect(result.priceChangePercentage24h).toBe(2.3);
    expect(result.circulatingSupply).toBe(19_500_000);
  });
});

describe("PricePipeline", () => {
  let repo: PriceRepository;
  let mockClient: CoinGeckoClient;

  beforeEach(() => {
    const db = createTestDatabase();
    repo = new PriceRepository(db);
    mockClient = new CoinGeckoClient({ rateLimitMs: 0 });
  });

  it("should ingest market data into the database", async () => {
    const mockData = [
      makeMockMarketData({ id: "bitcoin", symbol: "btc" }),
      makeMockMarketData({ id: "ethereum", symbol: "eth", current_price: 3500 }),
    ];

    vi.spyOn(mockClient, "getMarketData").mockResolvedValue(mockData);

    const pipeline = new PricePipeline(mockClient, repo);
    const result = await pipeline.ingest();

    expect(result.success).toBe(true);
    expect(result.tokensProcessed).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    expect(repo.getTokenCount()).toBe(2);
    expect(repo.getPriceCount()).toBe(2);
  });

  it("should handle empty API response", async () => {
    vi.spyOn(mockClient, "getMarketData").mockResolvedValue([]);

    const pipeline = new PricePipeline(mockClient, repo);
    const result = await pipeline.ingest();

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("No market data");
  });

  it("should handle API errors gracefully", async () => {
    vi.spyOn(mockClient, "getMarketData").mockRejectedValue(new Error("Network error"));

    const pipeline = new PricePipeline(mockClient, repo);
    const result = await pipeline.ingest();

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("Network error");
    expect(repo.getPriceCount()).toBe(0);
  });
});
