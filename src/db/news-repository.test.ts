import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase } from "./database.js";
import { NewsRepository, type ArticleInsert } from "./news-repository.js";
import type Database from "better-sqlite3";

function makeArticleInsert(overrides?: Partial<ArticleInsert>): ArticleInsert {
  return {
    guid: "https://example.com/article-1",
    title: "Bitcoin Hits New All-Time High",
    summary: "Bitcoin surged past $100,000 today amid institutional buying.",
    url: "https://example.com/article-1",
    source: "coindesk",
    author: "Jane Doe",
    publishedAt: "2026-03-15T12:00:00.000Z",
    relevanceScore: 45,
    tokenTags: ["btc"],
    ...overrides,
  };
}

describe("NewsRepository", () => {
  let db: Database.Database;
  let repo: NewsRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new NewsRepository(db);
  });

  describe("insertArticle", () => {
    it("should insert a new article", () => {
      const inserted = repo.insertArticle(makeArticleInsert());
      expect(inserted).toBe(true);
      expect(repo.getArticleCount()).toBe(1);
    });

    it("should deduplicate by guid", () => {
      repo.insertArticle(makeArticleInsert());
      const duplicate = repo.insertArticle(makeArticleInsert());
      expect(duplicate).toBe(false);
      expect(repo.getArticleCount()).toBe(1);
    });

    it("should handle null fields", () => {
      const inserted = repo.insertArticle(
        makeArticleInsert({ summary: null, author: null })
      );
      expect(inserted).toBe(true);
      const article = repo.getArticleByGuid("https://example.com/article-1");
      expect(article?.summary).toBeNull();
      expect(article?.author).toBeNull();
    });

    it("should store token tags as JSON", () => {
      repo.insertArticle(makeArticleInsert({ tokenTags: ["btc", "eth"] }));
      const article = repo.getArticleByGuid("https://example.com/article-1");
      expect(JSON.parse(article!.token_tags)).toEqual(["btc", "eth"]);
    });
  });

  describe("insertArticlesBatch", () => {
    it("should insert multiple articles in a transaction", () => {
      const articles = [
        makeArticleInsert({ guid: "article-1" }),
        makeArticleInsert({ guid: "article-2", title: "Ethereum Update" }),
        makeArticleInsert({ guid: "article-3", title: "Solana News" }),
      ];

      const count = repo.insertArticlesBatch(articles);
      expect(count).toBe(3);
      expect(repo.getArticleCount()).toBe(3);
    });

    it("should skip duplicates in batch", () => {
      repo.insertArticle(makeArticleInsert({ guid: "article-1" }));
      const articles = [
        makeArticleInsert({ guid: "article-1" }),
        makeArticleInsert({ guid: "article-2" }),
      ];

      const count = repo.insertArticlesBatch(articles);
      expect(count).toBe(1);
      expect(repo.getArticleCount()).toBe(2);
    });

    it("should handle empty batch", () => {
      const count = repo.insertArticlesBatch([]);
      expect(count).toBe(0);
    });
  });

  describe("getArticles", () => {
    beforeEach(() => {
      repo.insertArticlesBatch([
        makeArticleInsert({ guid: "a1", source: "coindesk", tokenTags: ["btc"], publishedAt: "2026-03-15T12:00:00Z" }),
        makeArticleInsert({ guid: "a2", source: "decrypt", tokenTags: ["eth"], publishedAt: "2026-03-15T11:00:00Z" }),
        makeArticleInsert({ guid: "a3", source: "coindesk", tokenTags: ["btc", "eth"], publishedAt: "2026-03-15T10:00:00Z" }),
      ]);
    });

    it("should return articles ordered by published_at desc", () => {
      const articles = repo.getArticles();
      expect(articles).toHaveLength(3);
      expect(articles[0].guid).toBe("a1");
    });

    it("should filter by source", () => {
      const articles = repo.getArticles({ source: "coindesk" });
      expect(articles).toHaveLength(2);
    });

    it("should filter by token tag", () => {
      const articles = repo.getArticles({ tokenTag: "eth" });
      expect(articles).toHaveLength(2);
    });

    it("should support pagination", () => {
      const articles = repo.getArticles({ limit: 1, offset: 1 });
      expect(articles).toHaveLength(1);
      expect(articles[0].guid).toBe("a2");
    });
  });

  describe("getSources", () => {
    it("should return distinct sources", () => {
      repo.insertArticlesBatch([
        makeArticleInsert({ guid: "a1", source: "coindesk" }),
        makeArticleInsert({ guid: "a2", source: "decrypt" }),
        makeArticleInsert({ guid: "a3", source: "coindesk" }),
      ]);

      const sources = repo.getSources();
      expect(sources).toEqual(["coindesk", "decrypt"]);
    });
  });
});
