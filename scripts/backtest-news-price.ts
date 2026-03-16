/**
 * Backtest: News Event × BTC/ETH Price Impact Analysis
 *
 * Pulls CoinGecko historical price data, cross-references with our news articles,
 * and measures price movements in windows after news publication.
 */

import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'data', 'wavedge.db');
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

// --- Types ---

interface Article {
  id: number;
  title: string;
  published_at: string;
  token_tags: string;
  relevance_score: number;
  source: string;
}

interface PricePoint {
  timestamp: number; // ms
  price: number;
}

interface EventResult {
  articleId: number;
  title: string;
  publishedAt: string;
  source: string;
  category: string;
  relevanceScore: number;
  priceAtEvent: number;
  price1h: number | null;
  price4h: number | null;
  price24h: number | null;
  change1h: number | null;
  change4h: number | null;
  change24h: number | null;
}

// --- News Category Classification ---

function categorizeArticle(title: string): string {
  const t = title.toLowerCase();

  // Regulatory / SEC / Government
  if (t.includes('sec') || t.includes('regulation') || t.includes('regulatory') ||
      t.includes('congress') || t.includes('senate') || t.includes('trump') ||
      t.includes('government') || t.includes('ban') || t.includes('legal') ||
      t.includes('lawsuit') || t.includes('enforcement') || t.includes('powell') ||
      t.includes('basel') || t.includes('law') || t.includes('florida') ||
      t.includes('bill') || t.includes('pardon')) {
    return 'regulation';
  }

  // ETF related
  if (t.includes('etf')) {
    return 'etf';
  }

  // Security / Hack
  if (t.includes('hack') || t.includes('exploit') || t.includes('breach') ||
      t.includes('vulnerability') || t.includes('attack') || t.includes('stolen')) {
    return 'security_incident';
  }

  // War / Geopolitical
  if (t.includes('war') || t.includes('iran') || t.includes('tariff') ||
      t.includes('sanction') || t.includes('geopolit')) {
    return 'geopolitical';
  }

  // Price / Market movement
  if (t.includes('ath') || t.includes('all-time') || t.includes('rally') ||
      t.includes('surge') || t.includes('pump') || t.includes('dump') ||
      t.includes('crash') || t.includes('dip') || t.includes('bull') ||
      t.includes('bear') || t.includes('green') || t.includes('red') ||
      t.includes('up ') || t.includes('down ') || t.includes('rebound') ||
      t.includes('strong') || t.includes('flat') || t.includes('outperform')) {
    return 'market_movement';
  }

  // Whale / Institutional
  if (t.includes('whale') || t.includes('saylor') || t.includes('microstrategy') ||
      t.includes('morgan stanley') || t.includes('institutional') ||
      t.includes('fund') || t.includes('accumulate') || t.includes('bitmine') ||
      t.includes('foundation')) {
    return 'institutional';
  }

  // Technology / Protocol
  if (t.includes('upgrade') || t.includes('update') || t.includes('fork') ||
      t.includes('protocol') || t.includes('node') || t.includes('layer') ||
      t.includes('simplif')) {
    return 'technology';
  }

  // Prediction / Analysis
  if (t.includes('predict') || t.includes('forecast') || t.includes('analyst') ||
      t.includes('million') || t.includes('target') || t.includes('revisit')) {
    return 'prediction';
  }

  return 'other';
}

// --- CoinGecko Data Fetching ---

async function fetchCoinGeckoMarketChart(
  coinId: string,
  fromTs: number,
  toTs: number
): Promise<PricePoint[]> {
  // CoinGecko free API: market_chart/range gives hourly data for 1-90 day ranges
  // For >90 days, we need to split into chunks
  const allPoints: PricePoint[] = [];
  const CHUNK_DAYS = 85; // stay under 90-day limit for hourly granularity
  const CHUNK_MS = CHUNK_DAYS * 24 * 60 * 60 * 1000;

  let currentFrom = fromTs;
  while (currentFrom < toTs) {
    const currentTo = Math.min(currentFrom + CHUNK_MS, toTs);
    const url = `${COINGECKO_BASE}/coins/${coinId}/market_chart/range?vs_currency=usd&from=${Math.floor(currentFrom / 1000)}&to=${Math.floor(currentTo / 1000)}`;

    console.log(`  Fetching ${coinId} prices: ${new Date(currentFrom).toISOString().slice(0, 10)} → ${new Date(currentTo).toISOString().slice(0, 10)}`);

    const resp = await fetch(url);
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`CoinGecko API error ${resp.status}: ${body}`);
    }

    const data = await resp.json();
    for (const [ts, price] of data.prices) {
      allPoints.push({ timestamp: ts, price });
    }

    currentFrom = currentTo;
    // Rate limit: CoinGecko free API = 10-30 req/min
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Sort by timestamp and deduplicate
  allPoints.sort((a, b) => a.timestamp - b.timestamp);
  return allPoints;
}

// --- Price Lookup ---

function findClosestPrice(prices: PricePoint[], targetMs: number): number | null {
  if (prices.length === 0) return null;

  // Binary search for closest timestamp
  let lo = 0;
  let hi = prices.length - 1;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (prices[mid].timestamp < targetMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  // Check lo and lo-1 for closest
  const candidates = [lo];
  if (lo > 0) candidates.push(lo - 1);

  let best = candidates[0];
  let bestDiff = Math.abs(prices[best].timestamp - targetMs);
  for (const c of candidates) {
    const diff = Math.abs(prices[c].timestamp - targetMs);
    if (diff < bestDiff) {
      best = c;
      bestDiff = diff;
    }
  }

  // Only return if within 2 hours of target
  if (bestDiff > 2 * 60 * 60 * 1000) return null;
  return prices[best].price;
}

function findPriceAfter(prices: PricePoint[], targetMs: number, hoursAfter: number): number | null {
  const futureMs = targetMs + hoursAfter * 60 * 60 * 1000;
  return findClosestPrice(prices, futureMs);
}

// --- Main ---

async function main() {
  console.log('=== News × Price Backtest ===\n');

  // 1. Load articles from DB
  const db = new Database(DB_PATH, { readonly: true });
  const articles: Article[] = db.prepare(`
    SELECT id, title, published_at, token_tags, relevance_score, source
    FROM articles
    WHERE token_tags LIKE '%btc%' OR token_tags LIKE '%eth%'
    ORDER BY published_at
  `).all() as Article[];
  db.close();

  console.log(`Found ${articles.length} articles mentioning BTC or ETH\n`);

  if (articles.length === 0) {
    console.log('No articles to analyze.');
    return;
  }

  // 2. Determine date range
  const publishDates = articles.map((a) => new Date(a.published_at).getTime());
  const minDate = Math.min(...publishDates) - 24 * 60 * 60 * 1000; // 1 day buffer
  const maxDate = Math.max(...publishDates) + 2 * 24 * 60 * 60 * 1000; // 2 day buffer for 24h window

  console.log(`Date range: ${new Date(minDate).toISOString().slice(0, 10)} → ${new Date(maxDate).toISOString().slice(0, 10)}\n`);

  // 3. Fetch CoinGecko historical data
  console.log('Fetching BTC price history...');
  const btcPrices = await fetchCoinGeckoMarketChart('bitcoin', minDate, maxDate);
  console.log(`  Got ${btcPrices.length} BTC price points\n`);

  console.log('Fetching ETH price history...');
  const ethPrices = await fetchCoinGeckoMarketChart('ethereum', minDate, maxDate);
  console.log(`  Got ${ethPrices.length} ETH price points\n`);

  // 4. Analyze each article
  const btcResults: EventResult[] = [];
  const ethResults: EventResult[] = [];

  for (const article of articles) {
    const tags: string[] = JSON.parse(article.token_tags);
    const pubMs = new Date(article.published_at).getTime();
    const category = categorizeArticle(article.title);

    for (const tag of tags) {
      const prices = tag === 'btc' ? btcPrices : tag === 'eth' ? ethPrices : null;
      if (!prices) continue;

      const priceAtEvent = findClosestPrice(prices, pubMs);
      if (!priceAtEvent) continue;

      const price1h = findPriceAfter(prices, pubMs, 1);
      const price4h = findPriceAfter(prices, pubMs, 4);
      const price24h = findPriceAfter(prices, pubMs, 24);

      const result: EventResult = {
        articleId: article.id,
        title: article.title,
        publishedAt: article.published_at,
        source: article.source,
        category,
        relevanceScore: article.relevance_score,
        priceAtEvent,
        price1h,
        price4h,
        price24h,
        change1h: price1h ? ((price1h - priceAtEvent) / priceAtEvent) * 100 : null,
        change4h: price4h ? ((price4h - priceAtEvent) / priceAtEvent) * 100 : null,
        change24h: price24h ? ((price24h - priceAtEvent) / priceAtEvent) * 100 : null,
      };

      if (tag === 'btc') btcResults.push(result);
      if (tag === 'eth') ethResults.push(result);
    }
  }

  console.log(`\nAnalyzed: ${btcResults.length} BTC events, ${ethResults.length} ETH events\n`);

  // 5. Aggregate by category
  function aggregateByCategory(results: EventResult[], token: string) {
    const categories = new Map<string, EventResult[]>();
    for (const r of results) {
      const existing = categories.get(r.category) || [];
      existing.push(r);
      categories.set(r.category, existing);
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log(`${token} — Price Impact by News Category`);
    console.log(`${'='.repeat(80)}`);
    console.log(
      `${'Category'.padEnd(20)} | ${'Count'.padStart(5)} | ${'Avg 1h %'.padStart(10)} | ${'Avg 4h %'.padStart(10)} | ${'Avg 24h %'.padStart(10)} | ${'Pos 24h'.padStart(7)}`
    );
    console.log('-'.repeat(80));

    const sortedCategories = [...categories.entries()].sort((a, b) => b[1].length - a[1].length);

    for (const [cat, events] of sortedCategories) {
      const valid1h = events.filter((e) => e.change1h !== null);
      const valid4h = events.filter((e) => e.change4h !== null);
      const valid24h = events.filter((e) => e.change24h !== null);

      const avg1h = valid1h.length > 0 ? valid1h.reduce((s, e) => s + e.change1h!, 0) / valid1h.length : NaN;
      const avg4h = valid4h.length > 0 ? valid4h.reduce((s, e) => s + e.change4h!, 0) / valid4h.length : NaN;
      const avg24h = valid24h.length > 0 ? valid24h.reduce((s, e) => s + e.change24h!, 0) / valid24h.length : NaN;
      const pos24h = valid24h.length > 0 ? valid24h.filter((e) => e.change24h! > 0).length : 0;

      console.log(
        `${cat.padEnd(20)} | ${String(events.length).padStart(5)} | ${isNaN(avg1h) ? 'N/A'.padStart(10) : avg1h.toFixed(3).padStart(10)} | ${isNaN(avg4h) ? 'N/A'.padStart(10) : avg4h.toFixed(3).padStart(10)} | ${isNaN(avg24h) ? 'N/A'.padStart(10) : avg24h.toFixed(3).padStart(10)} | ${String(pos24h + '/' + valid24h.length).padStart(7)}`
      );
    }

    // Overall
    const allValid24h = results.filter((e) => e.change24h !== null);
    const overallAvg24h = allValid24h.length > 0 ? allValid24h.reduce((s, e) => s + e.change24h!, 0) / allValid24h.length : NaN;
    console.log('-'.repeat(80));
    console.log(
      `${'OVERALL'.padEnd(20)} | ${String(results.length).padStart(5)} | ${''} | ${''} | ${isNaN(overallAvg24h) ? 'N/A'.padStart(10) : overallAvg24h.toFixed(3).padStart(10)} | ${''}`
    );
  }

  aggregateByCategory(btcResults, 'BTC');
  aggregateByCategory(ethResults, 'ETH');

  // 6. High-impact events (largest 24h moves)
  function showTopMovers(results: EventResult[], token: string, n: number = 10) {
    const valid = results.filter((e) => e.change24h !== null);
    valid.sort((a, b) => Math.abs(b.change24h!) - Math.abs(a.change24h!));

    console.log(`\n${'='.repeat(100)}`);
    console.log(`${token} — Top ${n} Largest 24h Price Moves After News`);
    console.log(`${'='.repeat(100)}`);

    for (const e of valid.slice(0, n)) {
      const direction = e.change24h! > 0 ? '↑' : '↓';
      console.log(
        `${direction} ${e.change24h!.toFixed(2).padStart(7)}% | ${e.category.padEnd(18)} | ${e.publishedAt.slice(0, 10)} | ${e.title.slice(0, 70)}`
      );
    }
  }

  showTopMovers(btcResults, 'BTC');
  showTopMovers(ethResults, 'ETH');

  // 7. Volatility analysis: high-relevance vs low-relevance
  function volatilityByRelevance(results: EventResult[], token: string) {
    const valid = results.filter((e) => e.change24h !== null);
    const highRel = valid.filter((e) => e.relevanceScore >= 50);
    const lowRel = valid.filter((e) => e.relevanceScore < 50);

    const avgAbs = (arr: EventResult[]) =>
      arr.length > 0 ? arr.reduce((s, e) => s + Math.abs(e.change24h!), 0) / arr.length : NaN;

    console.log(`\n${token} — Volatility by Relevance Score:`);
    console.log(`  High relevance (≥50): n=${highRel.length}, avg |24h move| = ${avgAbs(highRel).toFixed(3)}%`);
    console.log(`  Low relevance  (<50): n=${lowRel.length}, avg |24h move| = ${avgAbs(lowRel).toFixed(3)}%`);
  }

  volatilityByRelevance(btcResults, 'BTC');
  volatilityByRelevance(ethResults, 'ETH');

  // 8. Summary statistics
  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(80)}`);
  console.log(`Total articles analyzed: ${articles.length}`);
  console.log(`BTC events: ${btcResults.length} (${btcResults.filter((r) => r.change24h !== null).length} with 24h data)`);
  console.log(`ETH events: ${ethResults.length} (${ethResults.filter((r) => r.change24h !== null).length} with 24h data)`);
  console.log(`Date range: ${new Date(minDate).toISOString().slice(0, 10)} → ${new Date(maxDate).toISOString().slice(0, 10)}`);
  console.log(`BTC price range: $${Math.min(...btcPrices.map((p) => p.price)).toFixed(0)} - $${Math.max(...btcPrices.map((p) => p.price)).toFixed(0)}`);
  console.log(`ETH price range: $${Math.min(...ethPrices.map((p) => p.price)).toFixed(0)} - $${Math.max(...ethPrices.map((p) => p.price)).toFixed(0)}`);

  // Output the category counts
  const allCategories = new Set([...btcResults.map((r) => r.category), ...ethResults.map((r) => r.category)]);
  console.log(`\nNews categories found: ${[...allCategories].join(', ')}`);
}

main().catch((err) => {
  console.error('Backtest failed:', err);
  process.exit(1);
});
