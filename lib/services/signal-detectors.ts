import type { Pool } from "@neondatabase/serverless";
import { getPool } from "@/lib/db/database";

export interface Signal {
  type: "news_frequency" | "price_movement" | "volume_change" | "sentiment_shift" | "whale_alert";
  tokenSymbol: string;
  value: number;
  threshold: number;
  detail: string;
}

/**
 * Detect news frequency spike: count articles mentioning a token within a time window.
 */
export async function detectNewsFrequency(
  tokenSymbol: string,
  windowMinutes: number,
  threshold: number,
  db?: Pool
): Promise<Signal | null> {
  const pool = db || getPool();
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM articles
     WHERE token_tags LIKE $1 AND published_at >= NOW() - INTERVAL '${windowMinutes} minutes'`,
    [`%"${tokenSymbol.toUpperCase()}"%`]
  );
  const row = result.rows[0] as { count: number };

  if (row.count >= threshold) {
    return {
      type: "news_frequency",
      tokenSymbol,
      value: row.count,
      threshold,
      detail: `${row.count} articles mentioning ${tokenSymbol.toUpperCase()} in last ${windowMinutes}m (threshold: ${threshold})`,
    };
  }
  return null;
}

/**
 * Detect price movement: compare latest price to price N minutes ago.
 * Returns signal if absolute percentage change exceeds threshold.
 */
export async function detectPriceMovement(
  tokenSymbol: string,
  thresholdPercent: number,
  lookbackMinutes: number = 60,
  db?: Pool
): Promise<Signal | null> {
  const pool = db || getPool();

  // Get latest price
  const latestResult = await pool.query(
    `SELECT p.price_usd, p.fetched_at FROM prices p
     JOIN tokens t ON t.id = p.token_id
     WHERE t.symbol = $1
     ORDER BY p.fetched_at DESC LIMIT 1`,
    [tokenSymbol.toLowerCase()]
  );
  const latest = latestResult.rows[0] as { price_usd: number; fetched_at: string } | undefined;

  if (!latest) return null;

  // Get price from lookback period
  const pastResult = await pool.query(
    `SELECT p.price_usd FROM prices p
     JOIN tokens t ON t.id = p.token_id
     WHERE t.symbol = $1 AND p.fetched_at <= NOW() - INTERVAL '${lookbackMinutes} minutes'
     ORDER BY p.fetched_at DESC LIMIT 1`,
    [tokenSymbol.toLowerCase()]
  );
  const past = pastResult.rows[0] as { price_usd: number } | undefined;

  if (!past || past.price_usd === 0) return null;

  const changePercent = ((latest.price_usd - past.price_usd) / past.price_usd) * 100;

  if (Math.abs(changePercent) >= thresholdPercent) {
    const direction = changePercent > 0 ? "+" : "";
    return {
      type: "price_movement",
      tokenSymbol,
      value: changePercent,
      threshold: thresholdPercent,
      detail: `${tokenSymbol.toUpperCase()} price ${direction}${changePercent.toFixed(2)}% in last ${lookbackMinutes}m (threshold: ±${thresholdPercent}%)`,
    };
  }
  return null;
}

/**
 * Detect volume change: compare latest volume to previous data point.
 * Returns signal if percentage change exceeds threshold.
 */
export async function detectVolumeChange(
  tokenSymbol: string,
  thresholdPercent: number,
  db?: Pool
): Promise<Signal | null> {
  const pool = db || getPool();

  // Get the two most recent volume readings
  const result = await pool.query(
    `SELECT p.total_volume, p.fetched_at FROM prices p
     JOIN tokens t ON t.id = p.token_id
     WHERE t.symbol = $1 AND p.total_volume IS NOT NULL AND p.total_volume > 0
     ORDER BY p.fetched_at DESC LIMIT 2`,
    [tokenSymbol.toLowerCase()]
  );
  const rows = result.rows as { total_volume: number; fetched_at: string }[];

  if (rows.length < 2) return null;

  const [current, previous] = rows;
  if (previous.total_volume === 0) return null;

  const changePercent = ((current.total_volume - previous.total_volume) / previous.total_volume) * 100;

  if (Math.abs(changePercent) >= thresholdPercent) {
    const direction = changePercent > 0 ? "+" : "";
    return {
      type: "volume_change",
      tokenSymbol,
      value: changePercent,
      threshold: thresholdPercent,
      detail: `${tokenSymbol.toUpperCase()} volume ${direction}${changePercent.toFixed(1)}% (threshold: ±${thresholdPercent}%)`,
    };
  }
  return null;
}

/**
 * Detect social sentiment shift: compare latest mention count to previous data point.
 * Fires when mention volume change exceeds threshold (indicating viral social activity).
 * Also reports sentiment direction (bullish/bearish/neutral).
 */
export async function detectSentimentShift(
  tokenSymbol: string,
  thresholdPercent: number,
  db?: Pool
): Promise<Signal | null> {
  const pool = db || getPool();

  // Get the two most recent sentiment readings
  const result = await pool.query(
    `SELECT mention_count, sentiment_score, sentiment_label, fetched_at
     FROM social_mentions
     WHERE token_symbol = $1 AND mention_count > 0
     ORDER BY fetched_at DESC LIMIT 2`,
    [tokenSymbol.toUpperCase()]
  );
  const rows = result.rows as {
    mention_count: number;
    sentiment_score: number;
    sentiment_label: string;
    fetched_at: string;
  }[];

  if (rows.length < 2) return null;

  const [current, previous] = rows;
  if (previous.mention_count === 0) return null;

  const changePercent = ((current.mention_count - previous.mention_count) / previous.mention_count) * 100;

  if (Math.abs(changePercent) >= thresholdPercent) {
    const direction = changePercent > 0 ? "+" : "";
    const sentimentEmoji = current.sentiment_label === "bullish" ? "bullish" : current.sentiment_label === "bearish" ? "bearish" : "neutral";
    return {
      type: "sentiment_shift",
      tokenSymbol,
      value: changePercent,
      threshold: thresholdPercent,
      detail: `${tokenSymbol.toUpperCase()} social mentions ${direction}${changePercent.toFixed(1)}%, sentiment: ${sentimentEmoji} (threshold: ±${thresholdPercent}%)`,
    };
  }
  return null;
}

/**
 * Detect whale alert: check for large on-chain transfers within a time window.
 * Fires when the total USD value of whale transactions exceeds the threshold.
 */
export async function detectWhaleAlert(
  tokenSymbol: string,
  thresholdUsd: number,
  windowHours: number = 1,
  db?: Pool
): Promise<Signal | null> {
  const pool = db || getPool();

  const result = await pool.query(
    `SELECT COUNT(*) as tx_count, COALESCE(SUM(amount_usd), 0) as total_usd
     FROM whale_transactions
     WHERE token_symbol = $1 AND fetched_at >= NOW() - INTERVAL '${windowHours} hours'`,
    [tokenSymbol.toUpperCase()]
  );
  const row = result.rows[0] as { tx_count: number; total_usd: number };

  if (row.total_usd >= thresholdUsd) {
    const formatted = row.total_usd >= 1_000_000_000
      ? `$${(row.total_usd / 1_000_000_000).toFixed(1)}B`
      : row.total_usd >= 1_000_000
        ? `$${(row.total_usd / 1_000_000).toFixed(1)}M`
        : `$${(row.total_usd / 1_000).toFixed(0)}K`;
    return {
      type: "whale_alert",
      tokenSymbol,
      value: row.total_usd,
      threshold: thresholdUsd,
      detail: `${tokenSymbol.toUpperCase()} whale activity: ${row.tx_count} large tx totaling ${formatted} in last ${windowHours}h (threshold: $${(thresholdUsd / 1_000_000).toFixed(0)}M)`,
    };
  }
  return null;
}
