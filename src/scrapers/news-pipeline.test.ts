import { describe, it, expect, vi, beforeEach } from "vitest";
import { NewsPipeline, extractTokenTags, computeRelevanceScore, normalizeArticle } from "./news-pipeline.js";
import { NewsRepository } from "../db/news-repository.js";
import { RSSClient, type FeedItem } from "./rss-client.js";
import { createTestDatabase } from "../db/database.js";

function makeFeedItem(overrides?: Partial<FeedItem>): FeedItem {
  return {
    guid: "https://example.com/article-1",
    title: "Bitcoin Surges Past $100K",
    summary: "The world's largest cryptocurrency hit a new all-time high today.",
    url: "https://example.com/article-1",
    source: "coindesk",
    author: "John Smith",
    publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("extractTokenTags", () => {
  it("should extract bitcoin mentions", () => {
    const tags = extractTokenTags("Bitcoin price surges to new high");
    expect(tags).toContain("btc");
  });

  it("should extract multiple token mentions", () => {
    const tags = extractTokenTags("Bitcoin and Ethereum both rally, Solana follows");
    expect(tags).toContain("btc");
    expect(tags).toContain("eth");
    expect(tags).toContain("sol");
  });

  it("should handle symbol mentions", () => {
    const tags = extractTokenTags("BTC/USD trading pair shows strength");
    expect(tags).toContain("btc");
  });

  it("should return empty array for no matches", () => {
    const tags = extractTokenTags("Stock market news today");
    expect(tags).toEqual([]);
  });

  it("should not create duplicates for multiple keyword matches", () => {
    const tags = extractTokenTags("Bitcoin BTC price update");
    expect(tags.filter((t) => t === "btc")).toHaveLength(1);
  });

  it("should avoid false positives with word boundaries", () => {
    // "dot" shouldn't match inside "dotcom" or similar
    const tags = extractTokenTags("The company is a dotcom startup");
    expect(tags).not.toContain("dot");
  });
});

describe("computeRelevanceScore", () => {
  it("should give higher score for more token mentions", () => {
    const item1 = makeFeedItem({ title: "Bitcoin price update" });
    const item2 = makeFeedItem({ title: "Bitcoin and Ethereum price update" });

    const score1 = computeRelevanceScore(item1, ["btc"]);
    const score2 = computeRelevanceScore(item2, ["btc", "eth"]);

    expect(score2).toBeGreaterThan(score1);
  });

  it("should boost score for high-relevance keywords", () => {
    const item1 = makeFeedItem({ title: "Bitcoin price stable" });
    const item2 = makeFeedItem({ title: "Breaking: Bitcoin ETF approval" });

    const score1 = computeRelevanceScore(item1, ["btc"]);
    const score2 = computeRelevanceScore(item2, ["btc"]);

    expect(score2).toBeGreaterThan(score1);
  });

  it("should cap score at 100", () => {
    const item = makeFeedItem({
      title: "Breaking: Bitcoin ETF approval after SEC regulation crash rally",
      summary: "hack exploit airdrop listing launch partnership acquisition mainnet upgrade",
    });

    const score = computeRelevanceScore(item, ["btc", "eth", "sol"]);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("should give recency bonus for recent articles", () => {
    const recent = makeFeedItem({ publishedAt: new Date().toISOString() });
    const old = makeFeedItem({
      publishedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    });

    const scoreRecent = computeRelevanceScore(recent, ["btc"]);
    const scoreOld = computeRelevanceScore(old, ["btc"]);

    expect(scoreRecent).toBeGreaterThan(scoreOld);
  });
});

describe("normalizeArticle", () => {
  it("should convert FeedItem to ArticleInsert with tags and score", () => {
    const item = makeFeedItem({
      title: "Ethereum DeFi protocol launches new feature",
      summary: "A major Ethereum DeFi protocol announced a new yield product.",
    });

    const article = normalizeArticle(item);

    expect(article.guid).toBe(item.guid);
    expect(article.title).toBe(item.title);
    expect(article.tokenTags).toContain("eth");
    expect(article.relevanceScore).toBeGreaterThan(0);
  });
});

describe("NewsPipeline", () => {
  let repo: NewsRepository;
  let mockClient: RSSClient;

  beforeEach(() => {
    const db = createTestDatabase();
    repo = new NewsRepository(db);
    mockClient = new RSSClient([]);
  });

  it("should ingest articles into the database", async () => {
    const mockItems: FeedItem[] = [
      makeFeedItem({ guid: "article-1", title: "Bitcoin Update" }),
      makeFeedItem({ guid: "article-2", title: "Ethereum News", source: "decrypt" }),
    ];

    vi.spyOn(mockClient, "fetchAllFeeds").mockResolvedValue({
      items: mockItems,
      errors: [],
    });

    const pipeline = new NewsPipeline(mockClient, repo);
    const result = await pipeline.ingest();

    expect(result.success).toBe(true);
    expect(result.articlesIngested).toBe(2);
    expect(result.totalFetched).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(repo.getArticleCount()).toBe(2);
  });

  it("should handle partial feed failures", async () => {
    const mockItems: FeedItem[] = [
      makeFeedItem({ guid: "article-1" }),
    ];

    vi.spyOn(mockClient, "fetchAllFeeds").mockResolvedValue({
      items: mockItems,
      errors: ["Failed to fetch from theblock"],
    });

    const pipeline = new NewsPipeline(mockClient, repo);
    const result = await pipeline.ingest();

    expect(result.success).toBe(true);
    expect(result.articlesIngested).toBe(1);
    expect(result.errors).toHaveLength(1);
  });

  it("should handle complete failure", async () => {
    vi.spyOn(mockClient, "fetchAllFeeds").mockResolvedValue({
      items: [],
      errors: ["All feeds failed"],
    });

    const pipeline = new NewsPipeline(mockClient, repo);
    const result = await pipeline.ingest();

    expect(result.success).toBe(false);
    expect(result.articlesIngested).toBe(0);
  });

  it("should handle thrown errors", async () => {
    vi.spyOn(mockClient, "fetchAllFeeds").mockRejectedValue(new Error("Network error"));

    const pipeline = new NewsPipeline(mockClient, repo);
    const result = await pipeline.ingest();

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain("Network error");
  });

  it("should deduplicate on repeated ingestion", async () => {
    const mockItems: FeedItem[] = [
      makeFeedItem({ guid: "article-1" }),
    ];

    vi.spyOn(mockClient, "fetchAllFeeds").mockResolvedValue({
      items: mockItems,
      errors: [],
    });

    const pipeline = new NewsPipeline(mockClient, repo);
    await pipeline.ingest();
    const result = await pipeline.ingest();

    expect(result.articlesIngested).toBe(0);
    expect(repo.getArticleCount()).toBe(1);
  });
});
