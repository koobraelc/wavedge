import { CoinGeckoClient, type CoinGeckoMarketData } from "./coingecko-client.js";
import { PriceRepository, type PriceInsert } from "../db/price-repository.js";

export interface PipelineResult {
  success: boolean;
  tokensProcessed: number;
  errors: string[];
  durationMs: number;
}

export function mapMarketDataToInsert(data: CoinGeckoMarketData): PriceInsert {
  return {
    tokenId: data.id,
    symbol: data.symbol,
    name: data.name,
    priceUsd: data.current_price,
    marketCap: data.market_cap,
    totalVolume: data.total_volume,
    priceChange24h: data.price_change_24h,
    priceChangePercentage24h: data.price_change_percentage_24h,
    circulatingSupply: data.circulating_supply,
  };
}

export class PricePipeline {
  private client: CoinGeckoClient;
  private repo: PriceRepository;

  constructor(client?: CoinGeckoClient, repo?: PriceRepository) {
    this.client = client || new CoinGeckoClient();
    this.repo = repo || new PriceRepository();
  }

  async ingest(): Promise<PipelineResult> {
    const start = Date.now();
    const errors: string[] = [];
    let tokensProcessed = 0;

    try {
      const marketData = await this.client.getMarketData("usd", 100, 1);

      if (!Array.isArray(marketData) || marketData.length === 0) {
        return {
          success: false,
          tokensProcessed: 0,
          errors: ["No market data returned from CoinGecko"],
          durationMs: Date.now() - start,
        };
      }

      const inserts = marketData.map(mapMarketDataToInsert);
      tokensProcessed = this.repo.insertPricesBatch(inserts);

      console.log(
        `Price pipeline: ingested ${tokensProcessed} price records for ${marketData.length} tokens in ${Date.now() - start}ms`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      console.error(`Price pipeline error: ${message}`);
    }

    return {
      success: errors.length === 0,
      tokensProcessed,
      errors,
      durationMs: Date.now() - start,
    };
  }
}
