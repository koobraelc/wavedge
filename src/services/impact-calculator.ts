import type { ImpactRepository } from "../db/impact-repository.js";
import type { NewsRepository, ArticleRow } from "../db/news-repository.js";
import type { NewsClassifier, ClassificationResult } from "./news-classifier.js";

export interface ArticleImpact {
  articleId: number;
  title: string;
  category: string;
  categoryConfidence: number;
  tokenImpacts: TokenImpact[];
}

export interface TokenImpact {
  tokenSymbol: string;
  historical: HistoricalImpact;
  actual: ActualImpact | null;
}

export interface HistoricalImpact {
  sampleSize: number;
  avgChange1h: number | null;
  avgChange4h: number | null;
  avgChange24h: number | null;
  confidenceScore: number;
}

export interface ActualImpact {
  priceAtEvent: number | null;
  price1h: number | null;
  price4h: number | null;
  price24h: number | null;
  change1h: number | null;
  change4h: number | null;
  change24h: number | null;
}

/**
 * Compute confidence score based on sample size.
 * More historical data points = higher confidence.
 */
export function computeConfidence(sampleSize: number): number {
  if (sampleSize === 0) return 0;
  if (sampleSize < 3) return 0.1;
  if (sampleSize < 5) return 0.25;
  if (sampleSize < 10) return 0.4;
  if (sampleSize < 20) return 0.6;
  if (sampleSize < 50) return 0.75;
  return 0.9;
}

export class ImpactCalculator {
  constructor(
    private impactRepo: ImpactRepository,
    private newsRepo: NewsRepository,
    private classifier: NewsClassifier
  ) {}

  /**
   * Get impact data for a specific article.
   * Classifies the article if not already classified, then looks up historical impact.
   */
  async getArticleImpact(articleId: number): Promise<ArticleImpact | null> {
    const article = this.newsRepo.getArticleById(articleId);
    if (!article) return null;

    // Get or compute classification
    let categoryRow = this.impactRepo.getCategoryByArticleId(articleId);
    let classification: ClassificationResult;

    if (categoryRow) {
      classification = {
        category: categoryRow.category as any,
        confidence: categoryRow.confidence,
      };
    } else {
      classification = await this.classifier.classify({
        title: article.title,
        summary: article.summary,
      });
      this.impactRepo.upsertCategory({
        articleId,
        category: classification.category,
        confidence: classification.confidence,
      });
    }

    // Get token tags from article
    const tokenTags: string[] = JSON.parse(article.token_tags);

    // Build token impacts with historical data
    const tokenImpacts: TokenImpact[] = tokenTags.map((symbol) => {
      const historical = this.impactRepo.getHistoricalImpact(
        classification.category,
        symbol
      );
      const confidenceScore = computeConfidence(historical.sampleSize);

      // Check for actual impact event data
      const impactEvents = this.impactRepo.getImpactByArticleId(articleId);
      const event = impactEvents.find((e) => e.token_symbol === symbol);

      const actual: ActualImpact | null = event
        ? {
            priceAtEvent: event.price_at_event,
            price1h: event.price_1h,
            price4h: event.price_4h,
            price24h: event.price_24h,
            change1h: event.change_1h,
            change4h: event.change_4h,
            change24h: event.change_24h,
          }
        : null;

      return {
        tokenSymbol: symbol,
        historical: {
          sampleSize: historical.sampleSize,
          avgChange1h: historical.avgChange1h,
          avgChange4h: historical.avgChange4h,
          avgChange24h: historical.avgChange24h,
          confidenceScore,
        },
        actual,
      };
    });

    return {
      articleId,
      title: article.title,
      category: classification.category,
      categoryConfidence: classification.confidence,
      tokenImpacts,
    };
  }

  /**
   * Classify and store categories for all unclassified articles.
   */
  async classifyNewArticles(limit: number = 50): Promise<number> {
    const uncategorized = this.impactRepo.getUncategorizedArticleIds(limit);
    if (uncategorized.length === 0) return 0;

    let classified = 0;
    for (const articleId of uncategorized) {
      const article = this.newsRepo.getArticleById(articleId);
      if (!article) continue;

      const result = await this.classifier.classify({
        title: article.title,
        summary: article.summary,
      });

      this.impactRepo.upsertCategory({
        articleId,
        category: result.category,
        confidence: result.confidence,
      });
      classified++;
    }

    console.log(`Impact engine: classified ${classified} new articles`);
    return classified;
  }
}
