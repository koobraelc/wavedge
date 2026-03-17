import { Pool } from "pg";
import { getPool } from "./database.js";

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
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || getPool();
  }

  async upsertCategory(insert: NewsCategoryInsert): Promise<void> {
    await this.pool.query(
      `INSERT INTO news_categories (article_id, category, confidence)
         VALUES ($1, $2, $3)
         ON CONFLICT(article_id) DO UPDATE SET
           category = excluded.category,
           confidence = excluded.confidence,
           classified_at = NOW()`,
      [insert.articleId, insert.category, insert.confidence]
    );
  }

  async upsertCategoriesBatch(inserts: NewsCategoryInsert[]): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      let count = 0;
      for (const item of inserts) {
        await client.query(
          `INSERT INTO news_categories (article_id, category, confidence)
           VALUES ($1, $2, $3)
           ON CONFLICT(article_id) DO UPDATE SET
             category = excluded.category,
             confidence = excluded.confidence,
             classified_at = NOW()`,
          [item.articleId, item.category, item.confidence]
        );
        count++;
      }
      await client.query("COMMIT");
      return count;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async getCategoryByArticleId(articleId: number): Promise<NewsCategoryRow | undefined> {
    const { rows } = await this.pool.query(
      "SELECT * FROM news_categories WHERE article_id = $1",
      [articleId]
    );
    return rows[0] as NewsCategoryRow | undefined;
  }

  async upsertImpactEvent(insert: ImpactEventInsert): Promise<void> {
    await this.pool.query(
      `INSERT INTO impact_events (article_id, token_symbol, category, price_at_event,
          price_1h, price_4h, price_24h, change_1h, change_4h, change_24h,
          sample_size, avg_change_1h, avg_change_4h, avg_change_24h, confidence_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
           computed_at = NOW()`,
      [
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
        insert.confidenceScore,
      ]
    );
  }

  async upsertImpactEventsBatch(inserts: ImpactEventInsert[]): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      let count = 0;
      for (const item of inserts) {
        await client.query(
          `INSERT INTO impact_events (article_id, token_symbol, category, price_at_event,
              price_1h, price_4h, price_24h, change_1h, change_4h, change_24h,
              sample_size, avg_change_1h, avg_change_4h, avg_change_24h, confidence_score)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
             computed_at = NOW()`,
          [
            item.articleId,
            item.tokenSymbol,
            item.category,
            item.priceAtEvent,
            item.price1h,
            item.price4h,
            item.price24h,
            item.change1h,
            item.change4h,
            item.change24h,
            item.sampleSize,
            item.avgChange1h,
            item.avgChange4h,
            item.avgChange24h,
            item.confidenceScore,
          ]
        );
        count++;
      }
      await client.query("COMMIT");
      return count;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async getImpactByArticleId(articleId: number): Promise<ImpactEventRow[]> {
    const { rows } = await this.pool.query(
      "SELECT * FROM impact_events WHERE article_id = $1",
      [articleId]
    );
    return rows as ImpactEventRow[];
  }

  /** Get historical avg impact for a given category and token */
  async getHistoricalImpact(
    category: string,
    tokenSymbol: string
  ): Promise<{
    sampleSize: number;
    avgChange1h: number | null;
    avgChange4h: number | null;
    avgChange24h: number | null;
  }> {
    const { rows } = await this.pool.query(
      `SELECT
           COUNT(*) as sample_size,
           AVG(change_1h) as avg_change_1h,
           AVG(change_4h) as avg_change_4h,
           AVG(change_24h) as avg_change_24h
         FROM impact_events
         WHERE category = $1 AND token_symbol = $2 AND change_24h IS NOT NULL`,
      [category, tokenSymbol]
    );

    const row = rows[0] as {
      sample_size: string;
      avg_change_1h: number | null;
      avg_change_4h: number | null;
      avg_change_24h: number | null;
    };

    return {
      sampleSize: parseInt(row.sample_size, 10),
      avgChange1h: row.avg_change_1h,
      avgChange4h: row.avg_change_4h,
      avgChange24h: row.avg_change_24h,
    };
  }

  /** Get impact statistics grouped by category for a specific token */
  async getImpactStatsByToken(
    tokenSymbol: string
  ): Promise<{
    category: string;
    sampleSize: number;
    avgChange1h: number | null;
    avgChange4h: number | null;
    avgChange24h: number | null;
    confidenceScore: number;
  }[]> {
    const { rows } = await this.pool.query(
      `SELECT
           category,
           COUNT(*) as sample_size,
           AVG(change_1h) as avg_change_1h,
           AVG(change_4h) as avg_change_4h,
           AVG(change_24h) as avg_change_24h
         FROM impact_events
         WHERE token_symbol = $1 AND change_24h IS NOT NULL
         GROUP BY category
         ORDER BY COUNT(*) DESC`,
      [tokenSymbol.toLowerCase()]
    );

    return (rows as {
      category: string;
      sample_size: string;
      avg_change_1h: number | null;
      avg_change_4h: number | null;
      avg_change_24h: number | null;
    }[]).map((r) => ({
      category: r.category,
      sampleSize: parseInt(r.sample_size, 10),
      avgChange1h: r.avg_change_1h,
      avgChange4h: r.avg_change_4h,
      avgChange24h: r.avg_change_24h,
      confidenceScore: computeConfidenceFromSampleSize(parseInt(r.sample_size, 10)),
    }));
  }

  /** Get recent classified articles for a token (last 7 days) */
  async getRecentClassifiedArticles(
    tokenSymbol: string,
    days: number = 7
  ): Promise<{
    articleId: number;
    title: string;
    summary: string | null;
    category: string;
    confidence: number;
    publishedAt: string;
    change24h: number | null;
  }[]> {
    const { rows } = await this.pool.query(
      `SELECT
           a.id as "articleId",
           a.title,
           a.summary,
           nc.category,
           nc.confidence,
           a.published_at as "publishedAt",
           ie.change_24h as "change24h"
         FROM articles a
         JOIN news_categories nc ON nc.article_id = a.id
         LEFT JOIN impact_events ie ON ie.article_id = a.id AND ie.token_symbol = $1
         WHERE a.token_tags LIKE $2
           AND a.published_at >= NOW() - make_interval(days => $3)
         ORDER BY a.published_at DESC`,
      [
        tokenSymbol.toLowerCase(),
        `%"${tokenSymbol.toUpperCase()}"%`,
        days,
      ]
    );
    return rows as {
      articleId: number;
      title: string;
      summary: string | null;
      category: string;
      confidence: number;
      publishedAt: string;
      change24h: number | null;
    }[];
  }

  /** Get FAQ data for a token: top impact categories with data-backed stats */
  async getFaqData(
    tokenSymbol: string
  ): Promise<{
    category: string;
    avgChange24h: number;
    sampleSize: number;
    direction: "bullish" | "bearish" | "neutral";
    recentExample: string | null;
  }[]> {
    const { rows } = await this.pool.query(
      `SELECT
           ie.category,
           COUNT(*) as sample_size,
           AVG(ie.change_24h) as avg_change_24h,
           (SELECT a2.title FROM impact_events ie2
            JOIN articles a2 ON a2.id = ie2.article_id
            WHERE ie2.token_symbol = ie.token_symbol AND ie2.category = ie.category
            ORDER BY ie2.computed_at DESC LIMIT 1) as recent_example
         FROM impact_events ie
         WHERE ie.token_symbol = $1 AND ie.change_24h IS NOT NULL
         GROUP BY ie.category, ie.token_symbol
         HAVING COUNT(*) >= 2
         ORDER BY ABS(AVG(ie.change_24h)) DESC`,
      [tokenSymbol.toLowerCase()]
    );

    return (rows as {
      category: string;
      sample_size: string;
      avg_change_24h: number;
      recent_example: string | null;
    }[]).map((r) => ({
      category: r.category,
      avgChange24h: r.avg_change_24h,
      sampleSize: parseInt(r.sample_size, 10),
      direction:
        r.avg_change_24h > 0.1
          ? "bullish"
          : r.avg_change_24h < -0.1
            ? "bearish"
            : "neutral",
      recentExample: r.recent_example,
    }));
  }

  /** Get tokens frequently co-mentioned in articles with the given token */
  async getRelatedTokens(
    tokenSymbol: string,
    limit: number = 8
  ): Promise<{ symbol: string; coMentions: number }[]> {
    const { rows } = await this.pool.query(
      `SELECT token_tags FROM articles
         WHERE token_tags LIKE $1
         AND published_at >= NOW() - INTERVAL '30 days'
         ORDER BY published_at DESC
         LIMIT 200`,
      [`%"${tokenSymbol.toUpperCase()}"%`]
    );

    const counts = new Map<string, number>();
    const upperSymbol = tokenSymbol.toUpperCase();
    for (const row of rows as { token_tags: string }[]) {
      try {
        const tags: string[] = JSON.parse(row.token_tags);
        for (const tag of tags) {
          if (tag !== upperSymbol) {
            counts.set(tag, (counts.get(tag) || 0) + 1);
          }
        }
      } catch {
        // skip malformed
      }
    }

    return Array.from(counts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([symbol, coMentions]) => ({ symbol, coMentions }));
  }

  /**
   * Get classified articles that are old enough for impact computation
   * and don't already have impact events computed.
   * Uses 1h minimum age so partial data (1h impact) is available quickly;
   * 4h and 24h fields will be null until enough time passes.
   */
  async getArticlesReadyForImpact(limit: number = 100): Promise<{
    articleId: number;
    publishedAt: string;
    tokenTags: string;
    category: string;
  }[]> {
    const { rows } = await this.pool.query(
      `SELECT a.id as "articleId", a.published_at as "publishedAt",
                a.token_tags as "tokenTags", nc.category
         FROM articles a
         JOIN news_categories nc ON nc.article_id = a.id
         LEFT JOIN impact_events ie ON ie.article_id = a.id
         WHERE ie.id IS NULL
           AND a.token_tags != '[]'
           AND a.published_at <= NOW() - INTERVAL '1 hour'
         ORDER BY a.published_at DESC
         LIMIT $1`,
      [limit]
    );
    return rows as {
      articleId: number;
      publishedAt: string;
      tokenTags: string;
      category: string;
    }[];
  }

  async getUncategorizedArticleIds(limit: number = 100): Promise<number[]> {
    const { rows } = await this.pool.query(
      `SELECT a.id FROM articles a
         LEFT JOIN news_categories nc ON nc.article_id = a.id
         WHERE nc.id IS NULL
         ORDER BY a.published_at DESC
         LIMIT $1`,
      [limit]
    );
    return (rows as { id: number }[]).map((r) => r.id);
  }
}
