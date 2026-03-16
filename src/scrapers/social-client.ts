/**
 * Social mention client — fetches token mention volume and sentiment from social platforms.
 *
 * Currently supports:
 *  - LunarCrush API (free tier) for Twitter/X mention data
 *  - Fallback: news-based sentiment estimation from our own article database
 *
 * Set LUNARCRUSH_API_KEY env var to enable LunarCrush. Without it, falls back to
 * news-based sentiment derived from our existing article + classification data.
 */

export interface SocialMentionData {
  tokenSymbol: string;
  source: string;
  mentionCount: number;
  sentimentScore: number; // -1.0 to 1.0
  sentimentLabel: "bullish" | "bearish" | "neutral";
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  sampleTexts: string[];
}

export interface SocialClientOptions {
  apiKey?: string;
  baseUrl?: string;
}

export class SocialClient {
  private apiKey: string | undefined;
  private baseUrl: string;

  constructor(options?: SocialClientOptions) {
    this.apiKey = options?.apiKey || process.env.LUNARCRUSH_API_KEY;
    this.baseUrl = options?.baseUrl || "https://lunarcrush.com/api4/public";
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Fetch social mention data for a token from LunarCrush.
   * Returns null if the API is not configured or the request fails.
   */
  async fetchMentions(tokenSymbol: string): Promise<SocialMentionData | null> {
    if (!this.apiKey) return null;

    try {
      const url = `${this.baseUrl}/coins/${tokenSymbol.toLowerCase()}/v1`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        console.warn(`LunarCrush API error for ${tokenSymbol}: ${response.status}`);
        return null;
      }

      const data = await response.json() as {
        data?: {
          social_mentions_24h?: number;
          social_score?: number;
          sentiment?: number;
          bullish_sentiment?: number;
          bearish_sentiment?: number;
          tweets_24h?: string[];
        };
      };

      if (!data?.data) return null;

      const d = data.data;
      const mentionCount = d.social_mentions_24h || 0;
      // LunarCrush sentiment is 0-5, normalize to -1 to 1
      const rawSentiment = d.sentiment || 2.5;
      const sentimentScore = (rawSentiment - 2.5) / 2.5;
      const bullish = d.bullish_sentiment || 0;
      const bearish = d.bearish_sentiment || 0;
      const neutral = Math.max(0, mentionCount - bullish - bearish);

      return {
        tokenSymbol: tokenSymbol.toUpperCase(),
        source: "twitter",
        mentionCount,
        sentimentScore: Math.max(-1, Math.min(1, sentimentScore)),
        sentimentLabel: sentimentScore > 0.15 ? "bullish" : sentimentScore < -0.15 ? "bearish" : "neutral",
        positiveCount: bullish,
        negativeCount: bearish,
        neutralCount: neutral,
        sampleTexts: (d.tweets_24h || []).slice(0, 5),
      };
    } catch (err) {
      console.error(`LunarCrush fetch failed for ${tokenSymbol}:`, err);
      return null;
    }
  }

  /**
   * Batch fetch for multiple tokens.
   */
  async fetchBatch(symbols: string[]): Promise<SocialMentionData[]> {
    const results: SocialMentionData[] = [];
    for (const symbol of symbols) {
      const data = await this.fetchMentions(symbol);
      if (data) results.push(data);
      // Basic rate limiting — 1 request per second
      await new Promise((r) => setTimeout(r, 1000));
    }
    return results;
  }
}
