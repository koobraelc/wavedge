import { NextResponse } from "next/server";
import { PriceRepository } from "@/lib/db/price-repository";
import { NewsRepository } from "@/lib/db/news-repository";
import { ImpactRepository } from "@/lib/db/impact-repository";
import { SocialRepository } from "@/lib/db/social-repository";

const prices = new PriceRepository();
const news = new NewsRepository();
const impact = new ImpactRepository();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol: rawSymbol } = await params;
    const symbol = rawSymbol.toLowerCase();
    const token = await prices.getTokenBySymbol(symbol);
    if (!token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    const upperSymbol = token.symbol.toUpperCase();

    // Overview data
    const history = await prices.getPriceHistory(token.id, 1);
    const latestPrice = history[0] || null;
    const articles = await news.getArticles({ tokenTag: token.symbol, limit: 10 });

    // Impact data
    const stats = await impact.getImpactStatsByToken(token.symbol);
    const recentArticles = await impact.getRecentClassifiedArticles(token.symbol, 30);

    // Sentiment data
    const socialRepo = new SocialRepository();
    const latest = await socialRepo.getLatest(upperSymbol);
    const sentimentHistory = await socialRepo.getHistory(upperSymbol, 24);
    const change = await socialRepo.getMentionChange(upperSymbol);

    // Related tokens
    const related = await impact.getRelatedTokens(token.symbol);
    const enrichedRelated = [];
    for (const r of related) {
      const relToken = await prices.getTokenBySymbol(r.symbol.toLowerCase());
      enrichedRelated.push({ symbol: r.symbol, name: relToken?.name || r.symbol, coMentions: r.coMentions });
    }

    // FAQ data
    const faqData = await impact.getFaqData(token.symbol);
    const displayName = token.name;
    const faqs: { question: string; answer: string }[] = [];

    if (faqData.length > 0) {
      const categoryList = faqData
        .slice(0, 5)
        .map((f) => {
          const dir = f.direction === "bullish" ? "+" : f.direction === "bearish" ? "" : "~";
          return `${f.category} (${dir}${f.avgChange24h.toFixed(2)}% avg 24h impact, ${f.sampleSize} events)`;
        })
        .join(", ");
      faqs.push({
        question: `What affects ${displayName} (${upperSymbol}) price?`,
        answer: `Based on ${faqData.reduce((s, f) => s + f.sampleSize, 0)} analyzed events, the top factors affecting ${upperSymbol} price are: ${categoryList}.`,
      });
      for (const cat of faqData.slice(0, 4)) {
        const sign = cat.avgChange24h > 0 ? "+" : "";
        faqs.push({
          question: `How does ${cat.category} news affect ${upperSymbol}?`,
          answer: `${cat.category.charAt(0).toUpperCase() + cat.category.slice(1)} news has a ${cat.direction} effect on ${upperSymbol}, with an average 24-hour price change of ${sign}${cat.avgChange24h.toFixed(2)}% based on ${cat.sampleSize} events.${cat.recentExample ? ` Recent example: "${cat.recentExample}".` : ""}`,
        });
      }
    } else {
      faqs.push({
        question: `What affects ${displayName} (${upperSymbol}) price?`,
        answer: `We are actively tracking news events and their impact on ${upperSymbol} price. Check back soon for data-backed insights.`,
      });
    }
    faqs.push({
      question: `Where can I get ${upperSymbol} news today?`,
      answer: `Wavedge aggregates ${upperSymbol} news from 14+ sources in real-time, classifies each article by category, and measures its historical price impact.`,
    });

    return NextResponse.json({
      data: {
        overview: { token, price: latestPrice, recentNews: articles },
        impact: {
          symbol: upperSymbol,
          categories: stats,
          recentArticleCount: recentArticles.length,
          totalEvents: stats.reduce((sum, s) => sum + s.sampleSize, 0),
        },
        sentiment: {
          symbol: upperSymbol,
          current: latest
            ? {
                mentionCount: latest.mention_count,
                sentimentScore: latest.sentiment_score,
                sentimentLabel: latest.sentiment_label,
                positiveCount: latest.positive_count,
                negativeCount: latest.negative_count,
                neutralCount: latest.neutral_count,
                sampleTexts: JSON.parse(latest.sample_texts),
                source: latest.source,
                fetchedAt: latest.fetched_at,
              }
            : null,
          change: change
            ? { currentMentions: change.current, previousMentions: change.previous, changePercent: change.changePercent }
            : null,
          history: sentimentHistory.map((h) => ({
            mentionCount: h.mention_count,
            sentimentScore: h.sentiment_score,
            sentimentLabel: h.sentiment_label,
            fetchedAt: h.fetched_at,
          })),
        },
        related: { symbol: upperSymbol, related: enrichedRelated },
        faq: { symbol: upperSymbol, name: displayName, faqs },
      },
    });
  } catch (err) {
    console.error("[Tokens] Batch error:", err);
    return NextResponse.json({ error: "Failed to fetch token data" }, { status: 500 });
  }
}
