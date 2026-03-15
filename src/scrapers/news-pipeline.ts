import { RSSClient, type FeedItem } from "./rss-client.js";
import { NewsRepository, type ArticleInsert } from "../db/news-repository.js";

// Top cryptocurrencies for token tagging
const TOKEN_KEYWORDS: Record<string, string[]> = {
  btc: ["bitcoin", "btc"],
  eth: ["ethereum", "eth", "ether"],
  sol: ["solana", "sol"],
  xrp: ["ripple", "xrp"],
  ada: ["cardano", "ada"],
  doge: ["dogecoin", "doge"],
  dot: ["polkadot", "dot"],
  avax: ["avalanche", "avax"],
  matic: ["polygon", "matic"],
  link: ["chainlink", "link"],
  uni: ["uniswap", "uni"],
  atom: ["cosmos", "atom"],
  near: ["near protocol", "near"],
  apt: ["aptos", "apt"],
  arb: ["arbitrum", "arb"],
  op: ["optimism"],
  bnb: ["binance", "bnb"],
  trx: ["tron", "trx"],
  ltc: ["litecoin", "ltc"],
  shib: ["shiba", "shib"],
};

// High-signal keywords for relevance scoring
const HIGH_RELEVANCE_KEYWORDS = [
  "breaking", "launch", "hack", "exploit", "sec", "regulation",
  "etf", "approval", "partnership", "acquisition", "mainnet",
  "upgrade", "airdrop", "listing", "delisting", "crash", "rally",
  "all-time high", "ath", "hard fork", "halving",
];

const MEDIUM_RELEVANCE_KEYWORDS = [
  "defi", "nft", "dao", "staking", "yield", "liquidity",
  "whale", "institutional", "adoption", "mining", "validator",
  "governance", "proposal", "audit", "tokenomics", "layer 2",
  "bridge", "cross-chain", "web3",
];

export interface NewsPipelineResult {
  success: boolean;
  articlesIngested: number;
  totalFetched: number;
  errors: string[];
  durationMs: number;
}

export function extractTokenTags(text: string): string[] {
  const lower = text.toLowerCase();
  const tags = new Set<string>();

  for (const [symbol, keywords] of Object.entries(TOKEN_KEYWORDS)) {
    for (const keyword of keywords) {
      // Word boundary matching to avoid false positives
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (regex.test(lower)) {
        tags.add(symbol);
        break;
      }
    }
  }

  return Array.from(tags);
}

export function computeRelevanceScore(item: FeedItem, tokenTags: string[]): number {
  let score = 0;
  const text = `${item.title} ${item.summary || ""}`.toLowerCase();

  // Base score for having token mentions
  score += tokenTags.length * 10;

  // High relevance keywords
  for (const keyword of HIGH_RELEVANCE_KEYWORDS) {
    if (text.includes(keyword)) {
      score += 15;
    }
  }

  // Medium relevance keywords
  for (const keyword of MEDIUM_RELEVANCE_KEYWORDS) {
    if (text.includes(keyword)) {
      score += 5;
    }
  }

  // Recency bonus: articles less than 1 hour old get a boost
  const ageMs = Date.now() - new Date(item.publishedAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours < 1) score += 20;
  else if (ageHours < 6) score += 10;
  else if (ageHours < 24) score += 5;

  // Normalize to 0-100
  return Math.min(100, Math.max(0, score));
}

export function normalizeArticle(item: FeedItem): ArticleInsert {
  const searchText = `${item.title} ${item.summary || ""}`;
  const tokenTags = extractTokenTags(searchText);
  const relevanceScore = computeRelevanceScore(item, tokenTags);

  return {
    guid: item.guid,
    title: item.title,
    summary: item.summary,
    url: item.url,
    source: item.source,
    author: item.author,
    publishedAt: item.publishedAt,
    relevanceScore,
    tokenTags,
  };
}

export class NewsPipeline {
  private client: RSSClient;
  private repo: NewsRepository;

  constructor(client?: RSSClient, repo?: NewsRepository) {
    this.client = client || new RSSClient();
    this.repo = repo || new NewsRepository();
  }

  async ingest(): Promise<NewsPipelineResult> {
    const start = Date.now();
    const errors: string[] = [];

    try {
      const { items, errors: fetchErrors } = await this.client.fetchAllFeeds();
      errors.push(...fetchErrors);

      if (items.length === 0 && fetchErrors.length > 0) {
        return {
          success: false,
          articlesIngested: 0,
          totalFetched: 0,
          errors,
          durationMs: Date.now() - start,
        };
      }

      const articles = items.map(normalizeArticle);
      const ingested = this.repo.insertArticlesBatch(articles);

      console.log(
        `News pipeline: ingested ${ingested} new articles from ${items.length} fetched in ${Date.now() - start}ms`
      );

      return {
        success: true,
        articlesIngested: ingested,
        totalFetched: items.length,
        errors,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message);
      console.error(`News pipeline error: ${message}`);

      return {
        success: false,
        articlesIngested: 0,
        totalFetched: 0,
        errors,
        durationMs: Date.now() - start,
      };
    }
  }
}
