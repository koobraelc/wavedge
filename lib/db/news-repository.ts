import { Pool } from "@neondatabase/serverless";
import { getPool } from "./database";

export interface ArticleRow {
  id: number;
  guid: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  author: string | null;
  published_at: string;
  fetched_at: string;
  relevance_score: number;
  token_tags: string; // JSON array of token symbols
}

export interface ArticleInsert {
  guid: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  author: string | null;
  publishedAt: string;
  relevanceScore: number;
  tokenTags: string[];
}

export class NewsRepository {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || getPool();
  }

  async insertArticle(article: ArticleInsert): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO articles (guid, title, summary, url, source, author, published_at, relevance_score, token_tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT(guid) DO NOTHING`,
      [
        article.guid,
        article.title,
        article.summary,
        article.url,
        article.source,
        article.author,
        article.publishedAt,
        article.relevanceScore,
        JSON.stringify(article.tokenTags),
      ]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async insertArticlesBatch(articles: ArticleInsert[]): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      let count = 0;
      for (const item of articles) {
        const result = await client.query(
          `INSERT INTO articles (guid, title, summary, url, source, author, published_at, relevance_score, token_tags)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT(guid) DO NOTHING`,
          [
            item.guid,
            item.title,
            item.summary,
            item.url,
            item.source,
            item.author,
            item.publishedAt,
            item.relevanceScore,
            JSON.stringify(item.tokenTags),
          ]
        );
        if ((result.rowCount ?? 0) > 0) {
          count++;
        }
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

  async getArticles(options?: {
    source?: string;
    tokenTag?: string;
    limit?: number;
    offset?: number;
  }): Promise<ArticleRow[]> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (options?.source) {
      conditions.push(`source = $${paramIndex++}`);
      params.push(options.source);
    }

    if (options?.tokenTag) {
      conditions.push(`token_tags LIKE $${paramIndex++}`);
      params.push(`%"${options.tokenTag}"%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    params.push(limit);
    const limitParam = `$${paramIndex++}`;
    params.push(offset);
    const offsetParam = `$${paramIndex++}`;

    const { rows } = await this.pool.query(
      `SELECT * FROM articles ${where} ORDER BY published_at DESC LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params
    );
    return rows as ArticleRow[];
  }

  async getArticleById(id: number): Promise<ArticleRow | undefined> {
    const { rows } = await this.pool.query(
      "SELECT * FROM articles WHERE id = $1",
      [id]
    );
    return rows[0] as ArticleRow | undefined;
  }

  async getArticleByGuid(guid: string): Promise<ArticleRow | undefined> {
    const { rows } = await this.pool.query(
      "SELECT * FROM articles WHERE guid = $1",
      [guid]
    );
    return rows[0] as ArticleRow | undefined;
  }

  async getArticleCount(): Promise<number> {
    const { rows } = await this.pool.query(
      "SELECT COUNT(*) as count FROM articles"
    );
    return parseInt(rows[0].count, 10);
  }

  async getSources(): Promise<string[]> {
    const { rows } = await this.pool.query(
      "SELECT DISTINCT source FROM articles ORDER BY source"
    );
    return (rows as { source: string }[]).map((r) => r.source);
  }

  async getAllArticlesForRetag(): Promise<{ id: number; title: string; summary: string | null }[]> {
    const { rows } = await this.pool.query(
      "SELECT id, title, summary FROM articles"
    );
    return rows as { id: number; title: string; summary: string | null }[];
  }

  async updateTokenTags(id: number, tokenTags: string[]): Promise<void> {
    await this.pool.query(
      "UPDATE articles SET token_tags = $1 WHERE id = $2",
      [JSON.stringify(tokenTags), id]
    );
  }

  async retagAllArticles(tagger: (text: string) => string[]): Promise<{ total: number; updated: number }> {
    const articles = await this.getAllArticlesForRetag();
    let updated = 0;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const article of articles) {
        const searchText = `${article.title} ${article.summary || ""}`;
        const newTags = tagger(searchText);
        await client.query(
          "UPDATE articles SET token_tags = $1 WHERE id = $2",
          [JSON.stringify(newTags), article.id]
        );
        updated++;
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return { total: articles.length, updated };
  }
}
