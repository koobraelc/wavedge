import type Database from "better-sqlite3";
import { getDatabase } from "../db/database.js";

export interface Signal {
  type: "news_frequency" | "price_movement" | "volume_change";
  tokenSymbol: string;
  value: number;
  threshold: number;
  detail: string;
}

/**
 * Detect news frequency spike: count articles mentioning a token within a time window.
 */
export function detectNewsFrequency(
  tokenSymbol: string,
  windowMinutes: number,
  threshold: number,
  db?: Database.Database
): Signal | null {
  const database = db || getDatabase();
  const row = database
    .prepare(
      `SELECT COUNT(*) as count FROM articles
       WHERE token_tags LIKE ? AND published_at >= datetime('now', ?)`
    )
    .get(`%"${tokenSymbol.toUpperCase()}"%`, `-${windowMinutes} minutes`) as { count: number };

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
export function detectPriceMovement(
  tokenSymbol: string,
  thresholdPercent: number,
  lookbackMinutes: number = 60,
  db?: Database.Database
): Signal | null {
  const database = db || getDatabase();

  // Get latest price
  const latest = database
    .prepare(
      `SELECT p.price_usd, p.fetched_at FROM prices p
       JOIN tokens t ON t.id = p.token_id
       WHERE t.symbol = ?
       ORDER BY p.fetched_at DESC LIMIT 1`
    )
    .get(tokenSymbol.toLowerCase()) as { price_usd: number; fetched_at: string } | undefined;

  if (!latest) return null;

  // Get price from lookback period
  const past = database
    .prepare(
      `SELECT p.price_usd FROM prices p
       JOIN tokens t ON t.id = p.token_id
       WHERE t.symbol = ? AND p.fetched_at <= datetime('now', ?)
       ORDER BY p.fetched_at DESC LIMIT 1`
    )
    .get(tokenSymbol.toLowerCase(), `-${lookbackMinutes} minutes`) as { price_usd: number } | undefined;

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
export function detectVolumeChange(
  tokenSymbol: string,
  thresholdPercent: number,
  db?: Database.Database
): Signal | null {
  const database = db || getDatabase();

  // Get the two most recent volume readings
  const rows = database
    .prepare(
      `SELECT p.total_volume, p.fetched_at FROM prices p
       JOIN tokens t ON t.id = p.token_id
       WHERE t.symbol = ? AND p.total_volume IS NOT NULL AND p.total_volume > 0
       ORDER BY p.fetched_at DESC LIMIT 2`
    )
    .all(tokenSymbol.toLowerCase()) as { total_volume: number; fetched_at: string }[];

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
