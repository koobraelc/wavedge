import { Router } from "express";
import { PriceRepository } from "../db/price-repository.js";
import { NewsRepository } from "../db/news-repository.js";
import { ImpactRepository } from "../db/impact-repository.js";
import { SocialRepository } from "../db/social-repository.js";
import { SummaryService } from "../services/summary-service.js";

export function createTokensRouter(
  priceRepo?: PriceRepository,
  newsRepo?: NewsRepository,
  impactRepo?: ImpactRepository,
  summaryService?: SummaryService
): Router {
  const router = Router();
  const prices = priceRepo || new PriceRepository();
  const news = newsRepo || new NewsRepository();
  const impact = impactRepo || new ImpactRepository();
  const summaries = summaryService || new SummaryService(impact);

  /**
   * GET /api/tokens/:symbol/batch — all token detail data in one call.
   * Eliminates N+1 roundtrips: overview + impact + sentiment + related + faq.
   * Summary excluded (async AI call — loaded separately with loading state).
   */
  router.get("/:symbol/batch", (req, res) => {
    const symbol = req.params.symbol.toLowerCase();
    const token = prices.getTokenBySymbol(symbol);
    if (!token) {
      res.status(404).json({ error: "Token not found" });
      return;
    }

    const upperSymbol = token.symbol.toUpperCase();

    // Overview data
    const history = prices.getPriceHistory(token.id, 1);
    const latestPrice = history[0] || null;
    const articles = news.getArticles({ tokenTag: token.symbol, limit: 10 });

    // Impact data
    const stats = impact.getImpactStatsByToken(token.symbol);
    const recentArticles = impact.getRecentClassifiedArticles(token.symbol, 30);

    // Sentiment data
    const socialRepo = new SocialRepository();
    const latest = socialRepo.getLatest(upperSymbol);
    const sentimentHistory = socialRepo.getHistory(upperSymbol, 24);
    const change = socialRepo.getMentionChange(upperSymbol);

    // Related tokens
    const related = impact.getRelatedTokens(token.symbol);
    const enrichedRelated = related.map((r) => {
      const relToken = prices.getTokenBySymbol(r.symbol.toLowerCase());
      return { symbol: r.symbol, name: relToken?.name || r.symbol, coMentions: r.coMentions };
    });

    // FAQ data
    const faqData = impact.getFaqData(token.symbol);
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

    res.json({
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
  });

  /** GET /api/tokens/:symbol — token overview (price + news + metadata) */
  router.get("/:symbol", (req, res) => {
    const token = prices.getTokenBySymbol(req.params.symbol);
    if (!token) {
      res.status(404).json({ error: "Token not found" });
      return;
    }

    const history = prices.getPriceHistory(token.id, 1);
    const latestPrice = history[0] || null;
    const articles = news.getArticles({ tokenTag: token.symbol, limit: 10 });

    res.json({
      data: {
        token,
        price: latestPrice,
        recentNews: articles,
      },
    });
  });

  /** GET /api/tokens/:symbol/impact — historical impact statistics by news category */
  router.get("/:symbol/impact", (req, res) => {
    const symbol = req.params.symbol.toLowerCase();
    const token = prices.getTokenBySymbol(symbol);
    if (!token) {
      res.status(404).json({ error: "Token not found" });
      return;
    }

    const stats = impact.getImpactStatsByToken(token.symbol);
    const recentArticles = impact.getRecentClassifiedArticles(token.symbol, 30);

    res.json({
      data: {
        symbol: token.symbol.toUpperCase(),
        categories: stats,
        recentArticleCount: recentArticles.length,
        totalEvents: stats.reduce((sum, s) => sum + s.sampleSize, 0),
      },
    });
  });

  /** GET /api/tokens/:symbol/summary — AI-generated 7-day summary */
  router.get("/:symbol/summary", async (req, res) => {
    const symbol = req.params.symbol.toLowerCase();
    const token = prices.getTokenBySymbol(symbol);
    if (!token) {
      res.status(404).json({ error: "Token not found" });
      return;
    }

    const lang = req.query.lang === "zh" ? "zh" : "en";

    try {
      const summary = await summaries.getSummary(token.symbol, lang);
      if (!summary) {
        // Return a structured fallback instead of null so frontend can render something
        res.json({
          data: {
            symbol: token.symbol.toUpperCase(),
            lang,
            summary: null,
            sentimentBreakdown: {},
            netImpact: "neutral",
            keyEvents: [],
            articleCount: 0,
            generatedAt: null,
          },
          status: "no_data",
          message: "No news data available yet. Summary will generate automatically when articles are collected.",
        });
        return;
      }
      res.json({ data: summary, status: "ready" });
    } catch (error) {
      console.error("Summary generation error:", error);
      // Return 200 with error status so frontend can show retry instead of a hard failure
      res.json({
        data: null,
        status: "error",
        message: "Summary is temporarily unavailable. Tap to retry.",
        retryAfter: 30,
      });
    }
  });

  /** GET /api/tokens/:symbol/faq — data-backed FAQ for SEO */
  router.get("/:symbol/faq", (req, res) => {
    const symbol = req.params.symbol.toLowerCase();
    const token = prices.getTokenBySymbol(symbol);
    if (!token) {
      res.status(404).json({ error: "Token not found" });
      return;
    }

    const displaySymbol = token.symbol.toUpperCase();
    const displayName = token.name;
    const faqData = impact.getFaqData(token.symbol);

    const faqs: { question: string; answer: string }[] = [];

    // Always include the main FAQ question
    if (faqData.length > 0) {
      const categoryList = faqData
        .slice(0, 5)
        .map((f) => {
          const dir = f.direction === "bullish" ? "+" : f.direction === "bearish" ? "" : "~";
          return `${f.category} (${dir}${f.avgChange24h.toFixed(2)}% avg 24h impact, ${f.sampleSize} events)`;
        })
        .join(", ");
      faqs.push({
        question: `What affects ${displayName} (${displaySymbol}) price?`,
        answer: `Based on ${faqData.reduce((s, f) => s + f.sampleSize, 0)} analyzed events, the top factors affecting ${displaySymbol} price are: ${categoryList}. These impacts are measured as average 24-hour price changes following news in each category.`,
      });

      // Per-category questions for categories with enough data
      for (const cat of faqData.slice(0, 4)) {
        const sign = cat.avgChange24h > 0 ? "+" : "";
        faqs.push({
          question: `How does ${cat.category} news affect ${displaySymbol}?`,
          answer: `${cat.category.charAt(0).toUpperCase() + cat.category.slice(1)} news has a ${cat.direction} effect on ${displaySymbol}, with an average 24-hour price change of ${sign}${cat.avgChange24h.toFixed(2)}% based on ${cat.sampleSize} events.${cat.recentExample ? ` Recent example: "${cat.recentExample}".` : ""}`,
        });
      }
    } else {
      faqs.push({
        question: `What affects ${displayName} (${displaySymbol}) price?`,
        answer: `We are actively tracking news events and their impact on ${displaySymbol} price. Check back soon for data-backed insights on what drives ${displaySymbol} price movements.`,
      });
    }

    faqs.push({
      question: `Where can I get ${displaySymbol} news today?`,
      answer: `Wavedge aggregates ${displaySymbol} news from 14+ sources in real-time, classifies each article by category, and measures its historical price impact. Visit the ${displayName} page for the latest AI-analyzed news and alerts.`,
    });

    res.json({ data: { symbol: displaySymbol, name: displayName, faqs } });
  });

  /** GET /api/tokens/:symbol/sentiment — social sentiment data */
  router.get("/:symbol/sentiment", (req, res) => {
    const symbol = req.params.symbol.toLowerCase();
    const token = prices.getTokenBySymbol(symbol);
    if (!token) {
      res.status(404).json({ error: "Token not found" });
      return;
    }

    const socialRepo = new SocialRepository();
    const latest = socialRepo.getLatest(token.symbol.toUpperCase());
    const history = socialRepo.getHistory(token.symbol.toUpperCase(), 24);
    const change = socialRepo.getMentionChange(token.symbol.toUpperCase());

    res.json({
      data: {
        symbol: token.symbol.toUpperCase(),
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
          ? {
              currentMentions: change.current,
              previousMentions: change.previous,
              changePercent: change.changePercent,
            }
          : null,
        history: history.map((h) => ({
          mentionCount: h.mention_count,
          sentimentScore: h.sentiment_score,
          sentimentLabel: h.sentiment_label,
          fetchedAt: h.fetched_at,
        })),
      },
    });
  });

  /** GET /api/tokens/:symbol/related — tokens co-mentioned in articles */
  router.get("/:symbol/related", (req, res) => {
    const symbol = req.params.symbol.toLowerCase();
    const token = prices.getTokenBySymbol(symbol);
    if (!token) {
      res.status(404).json({ error: "Token not found" });
      return;
    }

    const related = impact.getRelatedTokens(token.symbol);

    // Enrich with token names
    const enriched = related.map((r) => {
      const relToken = prices.getTokenBySymbol(r.symbol.toLowerCase());
      return {
        symbol: r.symbol,
        name: relToken?.name || r.symbol,
        coMentions: r.coMentions,
      };
    });

    res.json({ data: { symbol: token.symbol.toUpperCase(), related: enriched } });
  });

  return router;
}
