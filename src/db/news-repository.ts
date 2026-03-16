import type Database from "better-sqlite3";
import { getDatabase } from "./database.js";

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
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  insertArticle(article: ArticleInsert): boolean {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO articles (guid, title, summary, url, source, author, published_at, relevance_score, token_tags)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        article.guid,
        article.title,
        article.summary,
        article.url,
        article.source,
        article.author,
        article.publishedAt,
        article.relevanceScore,
        JSON.stringify(article.tokenTags)
      );
    return result.changes > 0;
  }

  insertArticlesBatch(articles: ArticleInsert[]): number {
    const insertMany = this.db.transaction((items: ArticleInsert[]) => {
      let count = 0;
      for (const item of items) {
        if (this.insertArticle(item)) {
          count++;
        }
      }
      return count;
    });
    return insertMany(articles);
  }

  getArticles(options?: {
    source?: string;
    tokenTag?: string;
    limit?: number;
    offset?: number;
  }): ArticleRow[] {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options?.source) {
      conditions.push("source = ?");
      params.push(options.source);
    }

    if (options?.tokenTag) {
      conditions.push("token_tags LIKE ?");
      params.push(`%"${options.tokenTag}"%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    return this.db
      .prepare(
        `SELECT * FROM articles ${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as ArticleRow[];
  }

  getArticleById(id: number): ArticleRow | undefined {
    return this.db
      .prepare("SELECT * FROM articles WHERE id = ?")
      .get(id) as ArticleRow | undefined;
  }

  getArticleByGuid(guid: string): ArticleRow | undefined {
    return this.db
      .prepare("SELECT * FROM articles WHERE guid = ?")
      .get(guid) as ArticleRow | undefined;
  }

  getArticleCount(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM articles")
      .get() as { count: number };
    return row.count;
  }

  getSources(): string[] {
    const rows = this.db
      .prepare("SELECT DISTINCT source FROM articles ORDER BY source")
      .all() as { source: string }[];
    return rows.map((r) => r.source);
  }

  getAllArticlesForRetag(): { id: number; title: string; summary: string | null }[] {
    return this.db
      .prepare("SELECT id, title, summary FROM articles")
      .all() as { id: number; title: string; summary: string | null }[];
  }

  updateTokenTags(id: number, tokenTags: string[]): void {
    this.db
      .prepare("UPDATE articles SET token_tags = ? WHERE id = ?")
      .run(JSON.stringify(tokenTags), id);
  }

  retagAllArticles(tagger: (text: string) => string[]): { total: number; updated: number } {
    const articles = this.getAllArticlesForRetag();
    let updated = 0;

    const updateMany = this.db.transaction(() => {
      for (const article of articles) {
        const searchText = `${article.title} ${article.summary || ""}`;
        const newTags = tagger(searchText);
        this.updateTokenTags(article.id, newTags);
        updated++;
      }
    });

    updateMany();
    return { total: articles.length, updated };
  }
}
