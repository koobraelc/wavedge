import Anthropic from "@anthropic-ai/sdk";
import type { Pool } from "pg";
import { getPool } from "../db/database.js";
import type { ImpactRepository } from "../db/impact-repository.js";

export interface TokenSummary {
  symbol: string;
  lang: string;
  summary: string;
  sentimentBreakdown: Record<string, { count: number; sentiment: string }>;
  netImpact: string;
  keyEvents: string[];
  articleCount: number;
  generatedAt: string;
}

interface CachedSummaryRow {
  id: number;
  token_symbol: string;
  lang: string;
  summary_json: string;
  generated_at: string;
  expires_at: string;
}

/**
 * Generates AI-powered token summaries using Claude API.
 * Caches results in the summary_cache table (24h TTL).
 */
export class SummaryService {
  private client: Anthropic | null = null;
  private pool: Pool;

  constructor(
    private impactRepo: ImpactRepository,
    db?: Pool,
    apiKey?: string
  ) {
    this.pool = db || getPool();
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (key) {
      this.client = new Anthropic({ apiKey: key });
    }
  }

  /** Get or generate a summary for a token in the specified language */
  async getSummary(
    symbol: string,
    lang: "en" | "zh" = "en"
  ): Promise<TokenSummary | null> {
    const normalizedSymbol = symbol.toUpperCase();

    // Check cache first
    const cached = await this.getCachedSummary(normalizedSymbol, lang);
    if (cached) return cached;

    // Gather data for summary generation
    const articles = await this.impactRepo.getRecentClassifiedArticles(
      normalizedSymbol,
      7
    );
    const impactStats = await this.impactRepo.getImpactStatsByToken(normalizedSymbol);

    if (articles.length === 0) {
      return null;
    }

    // Build sentiment breakdown from articles
    const sentimentBreakdown: Record<
      string,
      { count: number; sentiment: string }
    > = {};
    for (const article of articles) {
      if (!sentimentBreakdown[article.category]) {
        const stat = impactStats.find((s) => s.category === article.category);
        const avgChange = stat?.avgChange24h ?? 0;
        sentimentBreakdown[article.category] = {
          count: 0,
          sentiment:
            avgChange > 0.5 ? "bullish" : avgChange < -0.5 ? "bearish" : "neutral",
        };
      }
      sentimentBreakdown[article.category].count++;
    }

    // Extract key events (top 5 most relevant articles)
    const keyEvents = articles
      .slice(0, 5)
      .map((a) => a.title);

    // Determine net impact
    const totalBullish = Object.values(sentimentBreakdown).filter(
      (v) => v.sentiment === "bullish"
    ).length;
    const totalBearish = Object.values(sentimentBreakdown).filter(
      (v) => v.sentiment === "bearish"
    ).length;
    const netImpact =
      totalBullish > totalBearish
        ? "bullish"
        : totalBearish > totalBullish
          ? "bearish"
          : "neutral";

    // Generate AI summary if Claude API is available
    let summaryText: string;
    if (this.client) {
      try {
        summaryText = await this.generateWithLLM(
          normalizedSymbol,
          lang,
          articles,
          sentimentBreakdown,
          netImpact
        );
      } catch (error) {
        console.warn(
          "LLM summary generation failed, using fallback:",
          error instanceof Error ? error.message : error
        );
        summaryText = this.generateFallbackSummary(
          normalizedSymbol,
          lang,
          articles,
          sentimentBreakdown,
          netImpact
        );
      }
    } else {
      summaryText = this.generateFallbackSummary(
        normalizedSymbol,
        lang,
        articles,
        sentimentBreakdown,
        netImpact
      );
    }

    const result: TokenSummary = {
      symbol: normalizedSymbol,
      lang,
      summary: summaryText,
      sentimentBreakdown,
      netImpact,
      keyEvents,
      articleCount: articles.length,
      generatedAt: new Date().toISOString(),
    };

    // Cache the result (24h TTL)
    await this.cacheSummary(normalizedSymbol, lang, result);
    return result;
  }

  private async getCachedSummary(
    symbol: string,
    lang: string
  ): Promise<TokenSummary | null> {
    const result = await this.pool.query(
      `SELECT * FROM summary_cache
       WHERE token_symbol = $1 AND lang = $2 AND expires_at > NOW()`,
      [symbol, lang]
    );
    const row = result.rows[0] as CachedSummaryRow | undefined;

    if (!row) return null;
    return JSON.parse(row.summary_json) as TokenSummary;
  }

  private async cacheSummary(
    symbol: string,
    lang: string,
    summary: TokenSummary
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO summary_cache (token_symbol, lang, summary_json, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 day')
       ON CONFLICT(token_symbol, lang) DO UPDATE SET
         summary_json = EXCLUDED.summary_json,
         generated_at = NOW(),
         expires_at = NOW() + INTERVAL '1 day'`,
      [symbol, lang, JSON.stringify(summary)]
    );
  }

  /** Invalidate cached summaries for a token (e.g., on significant news events) */
  async invalidateCache(symbol: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM summary_cache WHERE token_symbol = $1",
      [symbol.toUpperCase()]
    );
  }

  private async generateWithLLM(
    symbol: string,
    lang: "en" | "zh",
    articles: { title: string; category: string; change24h: number | null }[],
    sentimentBreakdown: Record<string, { count: number; sentiment: string }>,
    netImpact: string
  ): Promise<string> {
    const categoryList = Object.entries(sentimentBreakdown)
      .map(
        ([cat, data]) =>
          `- ${cat}: ${data.count} article(s), sentiment: ${data.sentiment}`
      )
      .join("\n");

    const articleList = articles
      .slice(0, 10)
      .map(
        (a) =>
          `- [${a.category}] ${a.title}${a.change24h != null ? ` (24h: ${a.change24h > 0 ? "+" : ""}${a.change24h.toFixed(2)}%)` : ""}`
      )
      .join("\n");

    const langInstruction =
      lang === "zh"
        ? "Respond ENTIRELY in Traditional Chinese (繁體中文). Use crypto-native Chinese terminology."
        : "Respond in English.";

    const response = await this.client!.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Write a concise 7-day intelligence summary for ${symbol}. ${langInstruction}

Category breakdown:
${categoryList}

Net assessment: ${netImpact}

Recent articles:
${articleList}

Format: 2-3 sentences covering the dominant news themes, their likely market impact, and the overall sentiment. Be data-driven and specific. Do not use markdown.`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }
    return content.text;
  }

  private generateFallbackSummary(
    symbol: string,
    lang: "en" | "zh",
    articles: { title: string; category: string }[],
    sentimentBreakdown: Record<string, { count: number; sentiment: string }>,
    netImpact: string
  ): string {
    const categoryParts = Object.entries(sentimentBreakdown)
      .map(([cat, data]) => {
        if (lang === "zh") {
          const catNames: Record<string, string> = {
            regulatory: "監管",
            etf: "ETF",
            geopolitical: "地緣政治",
            institutional: "機構",
            market: "市場",
            hack_exploit: "安全事件",
            technology: "技術",
            other: "其他",
          };
          const sentimentNames: Record<string, string> = {
            bullish: "偏多",
            bearish: "偏空",
            neutral: "中性",
          };
          return `${data.count} 條${catNames[cat] || cat}新聞（${sentimentNames[data.sentiment] || data.sentiment}）`;
        }
        return `${data.count} ${cat} article(s) (${data.sentiment})`;
      })
      .join(lang === "zh" ? "，" : ", ");

    const netNames =
      lang === "zh"
        ? { bullish: "偏多", bearish: "偏空", neutral: "中性" }
        : { bullish: "bullish", bearish: "bearish", neutral: "neutral" };
    const netLabel = netNames[netImpact as keyof typeof netNames] || netImpact;

    if (lang === "zh") {
      return `${symbol} 過去 7 天：${categoryParts}，淨影響${netLabel}。共 ${articles.length} 篇相關報導。`;
    }
    return `${symbol} past 7 days: ${categoryParts}. Net impact: ${netLabel}. ${articles.length} related article(s) total.`;
  }
}
