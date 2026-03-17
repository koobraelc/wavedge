import { SocialClient, type SocialMentionData } from "./social-client";
import { SocialRepository, type SocialMentionInsert } from "@/lib/db/social-repository";
import { NewsRepository } from "@/lib/db/news-repository";
import type { Pool } from "@neondatabase/serverless";
import { getPool } from "@/lib/db/database";

export interface SocialPipelineResult {
  success: boolean;
  tokensProcessed: number;
  source: "lunarcrush" | "news_derived";
  errors: string[];
  durationMs: number;
}

/**
 * Social sentiment pipeline.
 *
 * Strategy:
 *  1. If LunarCrush API key is set, fetch real Twitter/X mention data.
 *  2. Otherwise, derive sentiment from our own news article database:
 *     - Count articles per token in last window
 *     - Use news_categories sentiment (regulatory/hack = bearish, etf/institutional = bullish)
 *     - This gives us a usable social-adjacent signal without external API dependency.
 */
export class SocialPipeline {
  private client: SocialClient;
  private repo: SocialRepository;
  private newsRepo: NewsRepository;
  private pool: Pool;

  constructor(client?: SocialClient, repo?: SocialRepository, newsRepo?: NewsRepository, pool?: Pool) {
    this.pool = pool || getPool();
    this.client = client || new SocialClient();
    this.repo = repo || new SocialRepository(this.pool);
    this.newsRepo = newsRepo || new NewsRepository(this.pool);
  }

  async ingest(): Promise<SocialPipelineResult> {
    const start = Date.now();
    const errors: string[] = [];

    try {
      if (this.client.isConfigured) {
        return await this.ingestFromLunarCrush(start, errors);
      }
      return await this.ingestFromNews(start, errors);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      console.error(`Social pipeline error: ${message}`);
      return { success: false, tokensProcessed: 0, source: "news_derived", errors, durationMs: Date.now() - start };
    }
  }

  private async ingestFromLunarCrush(start: number, errors: string[]): Promise<SocialPipelineResult> {
    // Get tracked token symbols from our tokens table
    const symbols = await this.getTrackedSymbols();
    const mentions = await this.client.fetchBatch(symbols);

    const inserts: SocialMentionInsert[] = mentions.map((m) => ({
      tokenSymbol: m.tokenSymbol,
      source: m.source,
      mentionCount: m.mentionCount,
      sentimentScore: m.sentimentScore,
      sentimentLabel: m.sentimentLabel,
      positiveCount: m.positiveCount,
      negativeCount: m.negativeCount,
      neutralCount: m.neutralCount,
      sampleTexts: m.sampleTexts,
    }));

    const count = await this.repo.insertBatch(inserts);
    console.log(`Social pipeline (LunarCrush): processed ${count} tokens in ${Date.now() - start}ms`);

    return { success: true, tokensProcessed: count, source: "lunarcrush", errors, durationMs: Date.now() - start };
  }

  private async ingestFromNews(start: number, errors: string[]): Promise<SocialPipelineResult> {
    const symbols = await this.getTrackedSymbols();
    const inserts: SocialMentionInsert[] = [];

    for (const symbol of symbols) {
      const sentiment = await this.deriveFromNews(symbol);
      if (sentiment) inserts.push(sentiment);
    }

    const count = await this.repo.insertBatch(inserts);
    console.log(`Social pipeline (news-derived): processed ${count} tokens in ${Date.now() - start}ms`);

    return { success: true, tokensProcessed: count, source: "news_derived", errors, durationMs: Date.now() - start };
  }

  /** Derive sentiment from our news articles + categories. */
  private async deriveFromNews(tokenSymbol: string): Promise<SocialMentionInsert | null> {
    // Count articles mentioning this token in last 24h
    const row = (await this.pool.query(
      `SELECT COUNT(*) as count FROM articles
       WHERE token_tags LIKE $1 AND published_at >= NOW() - INTERVAL '24 hours'`,
      [`%"${tokenSymbol.toUpperCase()}"%`]
    )).rows[0] as { count: string };

    const mentionCount = parseInt(row.count, 10);

    // Always generate an entry — even 0 mentions — so token pages show data instead of empty states.
    if (mentionCount === 0) {
      return {
        tokenSymbol: tokenSymbol.toUpperCase(),
        source: "news_derived",
        mentionCount: 0,
        sentimentScore: 0,
        sentimentLabel: "neutral",
        positiveCount: 0,
        negativeCount: 0,
        neutralCount: 0,
        sampleTexts: [],
      };
    }

    // Categorize articles to derive sentiment
    const categoriesResult = await this.pool.query(
      `SELECT nc.category, COUNT(*) as cnt
       FROM articles a
       JOIN news_categories nc ON nc.article_id = a.id
       WHERE a.token_tags LIKE $1 AND a.published_at >= NOW() - INTERVAL '24 hours'
       GROUP BY nc.category`,
      [`%"${tokenSymbol.toUpperCase()}"%`]
    );
    const categories = categoriesResult.rows as { category: string; cnt: string }[];

    // Sentiment scoring based on news categories
    const CATEGORY_SENTIMENT: Record<string, number> = {
      etf: 0.7,
      institutional: 0.5,
      technology: 0.3,
      market: 0.1,
      other: 0,
      geopolitical: -0.2,
      regulatory: -0.3,
      hack_exploit: -0.8,
    };

    let weightedSum = 0;
    let totalWeight = 0;
    let positive = 0;
    let negative = 0;
    let neutral = 0;

    for (const cat of categories) {
      const score = CATEGORY_SENTIMENT[cat.category] ?? 0;
      const cnt = parseInt(cat.cnt, 10);
      weightedSum += score * cnt;
      totalWeight += cnt;

      if (score > 0.1) positive += cnt;
      else if (score < -0.1) negative += cnt;
      else neutral += cnt;
    }

    // For uncategorized articles, count as neutral
    const categorizedCount = categories.reduce((s, c) => s + parseInt(c.cnt, 10), 0);
    neutral += mentionCount - categorizedCount;

    const sentimentScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const sentimentLabel = sentimentScore > 0.15 ? "bullish" : sentimentScore < -0.15 ? "bearish" : "neutral";

    // Get sample article titles
    const sampleResult = await this.pool.query(
      `SELECT title FROM articles
       WHERE token_tags LIKE $1 AND published_at >= NOW() - INTERVAL '24 hours'
       ORDER BY published_at DESC LIMIT 3`,
      [`%"${tokenSymbol.toUpperCase()}"%`]
    );
    const sampleArticles = sampleResult.rows as { title: string }[];

    return {
      tokenSymbol: tokenSymbol.toUpperCase(),
      source: "news_derived",
      mentionCount,
      sentimentScore: Math.max(-1, Math.min(1, sentimentScore)),
      sentimentLabel: sentimentLabel as "bullish" | "bearish" | "neutral",
      positiveCount: positive,
      negativeCount: negative,
      neutralCount: neutral,
      sampleTexts: sampleArticles.map((a) => a.title),
    };
  }

  private async getTrackedSymbols(): Promise<string[]> {
    const result = await this.pool.query(
      "SELECT UPPER(symbol) as symbol FROM tokens ORDER BY symbol"
    );
    return result.rows.map((r: { symbol: string }) => r.symbol);
  }
}
