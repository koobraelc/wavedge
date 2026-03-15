import { describe, it, expect } from "vitest";
import { RSSClient, CRYPTO_FEEDS, type FeedSource } from "./rss-client.js";

describe("CRYPTO_FEEDS", () => {
  it("should contain the four required sources", () => {
    const names = CRYPTO_FEEDS.map((f) => f.name);
    expect(names).toContain("coindesk");
    expect(names).toContain("theblock");
    expect(names).toContain("decrypt");
    expect(names).toContain("cointelegraph");
  });

  it("should have valid URLs for all feeds", () => {
    for (const feed of CRYPTO_FEEDS) {
      expect(feed.url).toMatch(/^https:\/\//);
    }
  });
});

describe("RSSClient", () => {
  it("should initialize with custom feeds", () => {
    const customFeeds: FeedSource[] = [
      { name: "test", url: "https://example.com/rss" },
    ];
    const client = new RSSClient(customFeeds);
    expect(client).toBeDefined();
  });

  it("should return empty items and errors when all feeds fail", async () => {
    const badFeeds: FeedSource[] = [
      { name: "bad", url: "https://this-url-does-not-exist-404.example.com/rss" },
    ];
    const client = new RSSClient(badFeeds);
    const result = await client.fetchAllFeeds();

    expect(result.items).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
