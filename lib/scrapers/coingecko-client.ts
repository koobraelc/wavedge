export interface CoinGeckoMarketData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number | null;
  total_volume: number | null;
  price_change_24h: number | null;
  price_change_percentage_24h: number | null;
  circulating_supply: number | null;
}

export interface RateLimiter {
  lastRequestTime: number;
  minIntervalMs: number;
}

const DEFAULT_BASE_URL = "https://api.coingecko.com/api/v3";
const DEFAULT_RATE_LIMIT_MS = 6500; // CoinGecko free tier: ~10-30 req/min, be conservative

export class CoinGeckoClient {
  private baseUrl: string;
  private apiKey: string | undefined;
  private rateLimiter: RateLimiter;

  constructor(options?: { baseUrl?: string; apiKey?: string; rateLimitMs?: number }) {
    this.baseUrl = options?.baseUrl || DEFAULT_BASE_URL;
    this.apiKey = options?.apiKey || process.env.COINGECKO_API_KEY;
    this.rateLimiter = {
      lastRequestTime: 0,
      minIntervalMs: options?.rateLimitMs ?? DEFAULT_RATE_LIMIT_MS,
    };
  }

  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.rateLimiter.lastRequestTime;
    if (elapsed < this.rateLimiter.minIntervalMs) {
      const waitMs = this.rateLimiter.minIntervalMs - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.rateLimiter.lastRequestTime = Date.now();
  }

  private async fetchWithRetry(url: string, retries: number = 3): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.apiKey) {
      headers["x-cg-demo-api-key"] = this.apiKey;
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      await this.waitForRateLimit();

      const response = await fetch(url, { headers });

      if (response.ok) return response;

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("retry-after") || "60", 10);
        const waitMs = Math.min(retryAfter * 1000, 120_000);
        console.warn(`Rate limited (429). Waiting ${waitMs / 1000}s before retry ${attempt}/${retries}`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      if (attempt === retries) {
        throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
      }

      // Exponential backoff for other errors
      const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 30_000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }

    throw new Error("CoinGecko API: max retries exceeded");
  }

  async getMarketData(
    vsCurrency: string = "usd",
    perPage: number = 100,
    page: number = 1
  ): Promise<CoinGeckoMarketData[]> {
    const params = new URLSearchParams({
      vs_currency: vsCurrency,
      order: "market_cap_desc",
      per_page: perPage.toString(),
      page: page.toString(),
      sparkline: "false",
    });

    const url = `${this.baseUrl}/coins/markets?${params}`;
    const response = await this.fetchWithRetry(url);
    return response.json() as Promise<CoinGeckoMarketData[]>;
  }
}
