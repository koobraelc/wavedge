import RSSParser from "rss-parser";

export interface FeedSource {
  name: string;
  url: string;
}

export interface FeedItem {
  guid: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  author: string | null;
  publishedAt: string;
}

export const CRYPTO_FEEDS: FeedSource[] = [
  { name: "coindesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "theblock", url: "https://www.theblock.co/rss.xml" },
  { name: "decrypt", url: "https://decrypt.co/feed" },
  { name: "cointelegraph", url: "https://cointelegraph.com/rss" },
];

export class RSSClient {
  private parser: RSSParser;
  private feeds: FeedSource[];

  constructor(feeds?: FeedSource[]) {
    this.parser = new RSSParser({
      timeout: 15_000,
      headers: {
        "User-Agent": "Wavedge/0.1.0 (crypto news aggregator)",
      },
    });
    this.feeds = feeds || CRYPTO_FEEDS;
  }

  async fetchFeed(source: FeedSource): Promise<FeedItem[]> {
    const feed = await this.parser.parseURL(source.url);
    const items: FeedItem[] = [];

    for (const item of feed.items) {
      if (!item.title || !item.link) continue;

      const guid = item.guid || item.id || item.link;
      const publishedAt = item.pubDate || item.isoDate || new Date().toISOString();

      items.push({
        guid,
        title: item.title.trim(),
        summary: item.contentSnippet?.trim().slice(0, 500) || item.content?.trim().slice(0, 500) || null,
        url: item.link,
        source: source.name,
        author: item.creator || item["dc:creator"] || null,
        publishedAt: new Date(publishedAt).toISOString(),
      });
    }

    return items;
  }

  async fetchAllFeeds(): Promise<{ items: FeedItem[]; errors: string[] }> {
    const allItems: FeedItem[] = [];
    const errors: string[] = [];

    const results = await Promise.allSettled(
      this.feeds.map(async (source) => {
        const items = await this.fetchFeed(source);
        return { source: source.name, items };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        allItems.push(...result.value.items);
      } else {
        errors.push(result.reason?.message || String(result.reason));
      }
    }

    return { items: allItems, errors };
  }
}
