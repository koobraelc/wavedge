import type Database from "better-sqlite3";
import { getDatabase } from "./database.js";

/** Compute confidence score from sample size (matches impact-calculator logic) */
function computeConfidenceFromSampleSize(sampleSize: number): number {
  if (sampleSize === 0) return 0;
  if (sampleSize < 3) return 0.1;
  if (sampleSize < 5) return 0.25;
  if (sampleSize < 10) return 0.4;
  if (sampleSize < 20) return 0.6;
  if (sampleSize < 50) return 0.75;
  return 0.9;
}

export interface NewsCategoryRow {
  id: number;
  article_id: number;
  category: string;
  confidence: number;
  classified_at: string;
}

export interface NewsCategoryInsert {
  articleId: number;
  category: string;
  confidence: number;
}

export interface ImpactEventRow {
  id: number;
  article_id: number;
  token_symbol: string;
  category: string;
  price_at_event: number | null;
  price_1h: number | null;
  price_4h: number | null;
  price_24h: number | null;
  change_1h: number | null;
  change_4h: number | null;
  change_24h: number | null;
  sample_size: number;
  avg_change_1h: number | null;
  avg_change_4h: number | null;
  avg_change_24h: number | null;
  confidence_score: number;
  computed_at: string;
}

export interface ImpactEventInsert {
  articleId: number;
  tokenSymbol: string;
  category: string;
  priceAtEvent: number | null;
  price1h: number | null;
  price4h: number | null;
  price24h: number | null;
  change1h: number | null;
  change4h: number | null;
  change24h: number | null;
  sampleSize: number;
  avgChange1h: number | null;
  avgChange4h: number | null;
  avgChange24h: number | null;
  confidenceScore: number;
}

export class ImpactRepository {
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  upsertCategory(insert: NewsCategoryInsert): void {
    this.db
      .prepare(
        `INSERT INTO news_categories (article_id, category, confidence)
         VALUES (?, ?, ?)
         ON CONFLICT(article_id) DO UPDATE SET
           category = excluded.category,
           confidence = excluded.confidence,
           classified_at = datetime('now')`
      )
      .run(insert.articleId, insert.category, insert.confidence);
  }

  upsertCategoriesBatch(inserts: NewsCategoryInsert[]): number {
    const upsertMany = this.db.transaction((items: NewsCategoryInsert[]) => {
      let count = 0;
      for (const item of items) {
        this.upsertCategory(item);
        count++;
      }
      return count;
    });
    return upsertMany(inserts);
  }

  getCategoryByArticleId(articleId: number): NewsCategoryRow | undefined {
    return this.db
      .prepare("SELECT * FROM news_categories WHERE article_id = ?")
      .get(articleId) as NewsCategoryRow | undefined;
  }

  upsertImpactEvent(insert: ImpactEventInsert): void {
    this.db
      .prepare(
        `INSERT INTO impact_events (article_id, token_symbol, category, price_at_event,
          price_1h, price_4h, price_24h, change_1h, change_4h, change_24h,
          sample_size, avg_change_1h, avg_change_4h, avg_change_24h, confidence_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(article_id, token_symbol) DO UPDATE SET
           category = excluded.category,
           price_at_event = excluded.price_at_event,
           price_1h = excluded.price_1h,
           price_4h = excluded.price_4h,
           price_24h = excluded.price_24h,
           change_1h = excluded.change_1h,
           change_4h = excluded.change_4h,
           change_24h = excluded.change_24h,
           sample_size = excluded.sample_size,
           avg_change_1h = excluded.avg_change_1h,
           avg_change_4h = excluded.avg_change_4h,
           avg_change_24h = excluded.avg_change_24h,
           confidence_score = excluded.confidence_score,
           computed_at = datetime('now')`
      )
      .run(
        insert.articleId,
        insert.tokenSymbol,
        insert.category,
        insert.priceAtEvent,
        insert.price1h,
        insert.price4h,
        insert.price24h,
        insert.change1h,
        insert.change4h,
        insert.change24h,
        insert.sampleSize,
        insert.avgChange1h,
        insert.avgChange4h,
        insert.avgChange24h,
        insert.confidenceScore
      );
  }

  upsertImpactEventsBatch(inserts: ImpactEventInsert[]): number {
    const upsertMany = this.db.transaction((items: ImpactEventInsert[]) => {
      let count = 0;
      for (const item of items) {
        this.upsertImpactEvent(item);
        count++;
      }
      return count;
    });
    return upsertMany(inserts);
  }

  getImpactByArticleId(articleId: number): ImpactEventRow[] {
    return this.db
      .prepare("SELECT * FROM impact_events WHERE article_id = ?")
      .all(articleId) as ImpactEventRow[];
  }

  /** Get historical avg impact for a given category and token */
  getHistoricalImpact(
    category: string,
    tokenSymbol: string
  ): {
    sampleSize: number;
    avgChange1h: number | null;
    avgChange4h: number | null;
    avgChange24h: number | null;
  } {
    const row = this.db
      .prepare(
        `SELECT
           COUNT(*) as sample_size,
           AVG(change_1h) as avg_change_1h,
           AVG(change_4h) as avg_change_4h,
           AVG(change_24h) as avg_change_24h
         FROM impact_events
         WHERE category = ? AND token_symbol = ? AND change_24h IS NOT NULL`
      )
      .get(category, tokenSymbol) as {
      sample_size: number;
      avg_change_1h: number | null;
      avg_change_4h: number | null;
      avg_change_24h: number | null;
    };

    return {
      sampleSize: row.sample_size,
      avgChange1h: row.avg_change_1h,
      avgChange4h: row.avg_change_4h,
      avgChange24h: row.avg_change_24h,
    };
  }

  /** Get impact statistics grouped by category for a specific token */
  getImpactStatsByToken(
    tokenSymbol: string
  ): {
    category: string;
    sampleSize: number;
    avgChange1h: number | null;
    avgChange4h: number | null;
    avgChange24h: number | null;
    confidenceScore: number;
  }[] {
    const rows = this.db
      .prepare(
        `SELECT
           category,
           COUNT(*) as sample_size,
           AVG(change_1h) as avg_change_1h,
           AVG(change_4h) as avg_change_4h,
           AVG(change_24h) as avg_change_24h
         FROM impact_events
         WHERE token_symbol = ? AND change_24h IS NOT NULL
         GROUP BY category
         ORDER BY COUNT(*) DESC`
      )
      .all(tokenSymbol.toLowerCase()) as {
      category: string;
      sample_size: number;
      avg_change_1h: number | null;
      avg_change_4h: number | null;
      avg_change_24h: number | null;
    }[];

    return rows.map((r) => ({
      category: r.category,
      sampleSize: r.sample_size,
      avgChange1h: r.avg_change_1h,
      avgChange4h: r.avg_change_4h,
      avgChange24h: r.avg_change_24h,
      confidenceScore: computeConfidenceFromSampleSize(r.sample_size),
    }));
  }

  /** Get recent classified articles for a token (last 7 days) */
  getRecentClassifiedArticles(
    tokenSymbol: string,
    days: number = 7
  ): {
    articleId: number;
    title: string;
    summary: string | null;
    category: string;
    confidence: number;
    publishedAt: string;
    change24h: number | null;
  }[] {
    return this.db
      .prepare(
        `SELECT
           a.id as articleId,
           a.title,
           a.summary,
           nc.category,
           nc.confidence,
           a.published_at as publishedAt,
           ie.change_24h as change24h
         FROM articles a
         JOIN news_categories nc ON nc.article_id = a.id
         LEFT JOIN impact_events ie ON ie.article_id = a.id AND ie.token_symbol = ?
         WHERE a.token_tags LIKE ?
           AND a.published_at >= datetime('now', ?)
         ORDER BY a.published_at DESC`
      )
      .all(
        tokenSymbol.toLowerCase(),
        `%"${tokenSymbol.toUpperCase()}"%`,
        `-${days} days`
      ) as {
      articleId: number;
      title: string;
      summary: string | null;
      category: string;
      confidence: number;
      publishedAt: string;
      change24h: number | null;
    }[];
  }

  getUncategorizedArticleIds(limit: number = 100): number[] {
    const rows = this.db
      .prepare(
        `SELECT a.id FROM articles a
         LEFT JOIN news_categories nc ON nc.article_id = a.id
         WHERE nc.id IS NULL
         ORDER BY a.published_at DESC
         LIMIT ?`
      )
      .all(limit) as { id: number }[];
    return rows.map((r) => r.id);
  }
}
