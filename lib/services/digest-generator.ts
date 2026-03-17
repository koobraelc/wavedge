import Anthropic from "@anthropic-ai/sdk";
import type { Pool } from "@neondatabase/serverless";
import { getPool } from "@/lib/db/database";

export interface DigestContent {
  lang: "en" | "zh";
  subject: string;
  bodyHtml: string;
  bodyTelegram: string;
  generatedAt: string;
}

interface ArticleDigestData {
  title: string;
  source: string;
  category: string;
  published_at: string;
  token_tags: string;
  change_24h: number | null;
}

interface PriceMover {
  symbol: string;
  name: string;
  price_usd: number;
  change_pct: number;
}

interface AlertDigestData {
  token_symbol: string;
  signal_count: number;
  summary: string;
  created_at: string;
}

/**
 * Generates daily crypto intelligence digest content in both languages.
 * Aggregates news, price moves, and cross-signal alerts from the past 24h.
 */
export class DigestGenerator {
  private client: Anthropic | null = null;
  private pool: Pool;

  constructor(db?: Pool, apiKey?: string) {
    this.pool = db || getPool();
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (key) {
      this.client = new Anthropic({ apiKey: key });
    }
  }

  async generate(lang: "en" | "zh"): Promise<DigestContent> {
    const articles = await this.getRecentArticles();
    const topMovers = await this.getTopMovers();
    const alerts = await this.getRecentAlerts();

    const dateStr = new Date().toISOString().split("T")[0];

    let bodyText: string;
    if (this.client) {
      try {
        bodyText = await this.generateWithLLM(lang, articles, topMovers, alerts, dateStr);
      } catch (err) {
        console.warn("Digest LLM generation failed, using fallback:", err instanceof Error ? err.message : err);
        bodyText = this.generateFallback(lang, articles, topMovers, alerts, dateStr);
      }
    } else {
      bodyText = this.generateFallback(lang, articles, topMovers, alerts, dateStr);
    }

    const subject = lang === "zh"
      ? `🧠 Wavedge 每日加密情報 — ${dateStr}`
      : `🧠 Wavedge Daily Crypto Intelligence — ${dateStr}`;

    const bodyHtml = this.formatHtml(bodyText, subject, dateStr);
    const bodyTelegram = this.formatTelegram(bodyText, dateStr, lang);

    return {
      lang,
      subject,
      bodyHtml,
      bodyTelegram,
      generatedAt: new Date().toISOString(),
    };
  }

  private async getRecentArticles(): Promise<ArticleDigestData[]> {
    const result = await this.pool.query(
      `SELECT a.title, a.source, a.published_at, a.token_tags,
              nc.category, ie.change_24h
       FROM articles a
       LEFT JOIN news_categories nc ON nc.article_id = a.id
       LEFT JOIN impact_events ie ON ie.article_id = a.id
       WHERE a.published_at >= NOW() - INTERVAL '1 day'
       ORDER BY a.relevance_score DESC, a.published_at DESC
       LIMIT 30`
    );
    return result.rows as ArticleDigestData[];
  }

  private async getTopMovers(): Promise<PriceMover[]> {
    const result = await this.pool.query(
      `SELECT t.symbol, t.name, p.price_usd, p.price_change_percentage_24h as change_pct
       FROM tokens t
       JOIN prices p ON p.token_id = t.id
       WHERE p.fetched_at = (SELECT MAX(p2.fetched_at) FROM prices p2 WHERE p2.token_id = t.id)
         AND p.price_change_percentage_24h IS NOT NULL
       ORDER BY ABS(p.price_change_percentage_24h) DESC
       LIMIT 10`
    );
    return result.rows as PriceMover[];
  }

  private async getRecentAlerts(): Promise<AlertDigestData[]> {
    const result = await this.pool.query(
      `SELECT token_symbol, signal_count, summary, created_at
       FROM triggered_alerts
       WHERE created_at >= NOW() - INTERVAL '1 day'
       ORDER BY signal_count DESC, created_at DESC
       LIMIT 10`
    );
    return result.rows as AlertDigestData[];
  }

  private async generateWithLLM(
    lang: "en" | "zh",
    articles: ArticleDigestData[],
    movers: PriceMover[],
    alerts: AlertDigestData[],
    dateStr: string
  ): Promise<string> {
    const langInstruction = lang === "zh"
      ? "Write ENTIRELY in Traditional Chinese (繁體中文). Use crypto-native Chinese terminology."
      : "Write in English.";

    // Build category summary
    const catCounts: Record<string, number> = {};
    for (const a of articles) {
      if (a.category) {
        catCounts[a.category] = (catCounts[a.category] || 0) + 1;
      }
    }
    const catSummary = Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => `${cat}: ${count}`)
      .join(", ");

    const topArticles = articles
      .slice(0, 10)
      .map((a) => {
        const impact = a.change_24h != null ? ` (24h: ${a.change_24h > 0 ? "+" : ""}${a.change_24h.toFixed(2)}%)` : "";
        return `- [${a.category || "uncategorized"}] ${a.title}${impact} (${a.source})`;
      })
      .join("\n");

    const moversList = movers
      .map((m) => `- ${m.symbol.toUpperCase()} (${m.name}): $${m.price_usd.toLocaleString("en-US", { maximumFractionDigits: 2 })} (${m.change_pct > 0 ? "+" : ""}${m.change_pct.toFixed(2)}%)`)
      .join("\n");

    const alertsList = alerts.length > 0
      ? alerts.map((a) => `- ${a.token_symbol.toUpperCase()}: ${a.summary} (${a.signal_count} signals)`).join("\n")
      : "No multi-signal alerts in the past 24h.";

    const response = await this.client!.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `Write a concise daily crypto intelligence digest for ${dateStr}. ${langInstruction}

This should be a 3-5 minute read with a conversational but data-driven tone. Structure it as:
1. A punchy 1-sentence opening summary of the day
2. "Top Movers" section with the biggest price moves and brief context
3. "News Highlights" section covering the most impactful stories (by category)
4. "Cross-Signal Alerts" section if any multi-signal events occurred
5. A brief closing outlook (1-2 sentences)

Do NOT use markdown headers (no # symbols). Use plain text with clear section labels.
Use bullet points (•) for lists. Keep it scannable.

DATA:

News category breakdown (past 24h): ${catSummary || "No classified articles"}
Total articles: ${articles.length}

Top articles:
${topArticles || "No articles in the past 24h."}

Top movers:
${moversList || "No price data available."}

Cross-signal alerts:
${alertsList}`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }
    return content.text;
  }

  private generateFallback(
    lang: "en" | "zh",
    articles: ArticleDigestData[],
    movers: PriceMover[],
    alerts: AlertDigestData[],
    dateStr: string
  ): string {
    if (lang === "zh") {
      return this.generateFallbackZh(articles, movers, alerts, dateStr);
    }
    return this.generateFallbackEn(articles, movers, alerts, dateStr);
  }

  private generateFallbackEn(
    articles: ArticleDigestData[],
    movers: PriceMover[],
    alerts: AlertDigestData[],
    dateStr: string
  ): string {
    const lines: string[] = [
      `Daily Crypto Intelligence — ${dateStr}`,
      "",
      `${articles.length} articles tracked across the crypto ecosystem in the past 24 hours.`,
      "",
    ];

    if (movers.length > 0) {
      lines.push("TOP MOVERS");
      for (const m of movers.slice(0, 5)) {
        const dir = m.change_pct > 0 ? "+" : "";
        lines.push(`• ${m.symbol.toUpperCase()}: $${m.price_usd.toLocaleString("en-US", { maximumFractionDigits: 2 })} (${dir}${m.change_pct.toFixed(2)}%)`);
      }
      lines.push("");
    }

    if (articles.length > 0) {
      lines.push("NEWS HIGHLIGHTS");
      for (const a of articles.slice(0, 5)) {
        lines.push(`• [${a.category || "uncategorized"}] ${a.title} (${a.source})`);
      }
      lines.push("");
    }

    if (alerts.length > 0) {
      lines.push("CROSS-SIGNAL ALERTS");
      for (const a of alerts.slice(0, 3)) {
        lines.push(`• ${a.token_symbol.toUpperCase()}: ${a.summary}`);
      }
      lines.push("");
    }

    lines.push("— Wavedge AI Intelligence Engine");
    return lines.join("\n");
  }

  private generateFallbackZh(
    articles: ArticleDigestData[],
    movers: PriceMover[],
    alerts: AlertDigestData[],
    dateStr: string
  ): string {
    const lines: string[] = [
      `每日加密情報 — ${dateStr}`,
      "",
      `過去 24 小時追蹤了 ${articles.length} 篇加密貨幣相關報導。`,
      "",
    ];

    if (movers.length > 0) {
      lines.push("漲跌排行");
      for (const m of movers.slice(0, 5)) {
        const dir = m.change_pct > 0 ? "+" : "";
        lines.push(`• ${m.symbol.toUpperCase()}: $${m.price_usd.toLocaleString("en-US", { maximumFractionDigits: 2 })} (${dir}${m.change_pct.toFixed(2)}%)`);
      }
      lines.push("");
    }

    if (articles.length > 0) {
      lines.push("新聞摘要");
      for (const a of articles.slice(0, 5)) {
        lines.push(`• [${a.category || "未分類"}] ${a.title} (${a.source})`);
      }
      lines.push("");
    }

    if (alerts.length > 0) {
      lines.push("多信號異動");
      for (const a of alerts.slice(0, 3)) {
        lines.push(`• ${a.token_symbol.toUpperCase()}: ${a.summary}`);
      }
      lines.push("");
    }

    lines.push("— Wavedge AI 情報引擎");
    return lines.join("\n");
  }

  private formatHtml(bodyText: string, subject: string, dateStr: string): string {
    const escaped = escapeHtml(bodyText);
    const htmlBody = escaped
      .split("\n")
      .map((line) => {
        if (line.startsWith("•")) {
          return `<li style="margin:4px 0">${line.slice(1).trim()}</li>`;
        }
        if (line.match(/^(TOP MOVERS|NEWS HIGHLIGHTS|CROSS-SIGNAL ALERTS|漲跌排行|新聞摘要|多信號異動)/)) {
          return `</ul><h3 style="color:#6366f1;margin:20px 0 8px;font-size:16px">${line}</h3><ul style="list-style:none;padding:0">`;
        }
        if (line.trim() === "") return "";
        return `<p style="margin:8px 0;color:#374151">${line}</p>`;
      })
      .join("\n");

    return `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <div style="text-align:center;margin-bottom:24px">
    <h1 style="color:#1f2937;font-size:20px;margin:0">${escapeHtml(subject)}</h1>
    <p style="color:#9ca3af;font-size:12px;margin:4px 0">${dateStr}</p>
  </div>
  ${htmlBody}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="font-size:11px;color:#9ca3af;text-align:center">
    Wavedge AI Intelligence Engine<br>
    <a href="{{{unsubscribe_url}}}" style="color:#6366f1">Unsubscribe</a>
  </p>
</div>`;
  }

  private formatTelegram(bodyText: string, dateStr: string, lang: "en" | "zh"): string {
    const header = lang === "zh"
      ? `🧠 *Wavedge 每日加密情報*\n📅 ${dateStr}`
      : `🧠 *Wavedge Daily Crypto Intelligence*\n📅 ${dateStr}`;

    return `${header}\n\n${bodyText}`;
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
