import type Database from "better-sqlite3";
import { getDatabase } from "../db/database.js";

/**
 * Dynamic token tagging configuration.
 * Loaded from the `tokens` DB table instead of hardcoded list.
 */
export interface TokenConfig {
  safe: string[];        // case-insensitive word-boundary match
  uppercaseOnly?: string[]; // case-sensitive uppercase-only match
}

const SHORT_SYMBOL_MAX_LEN = 3;

/**
 * Build TokenConfig rules from DB rows.
 * - Token name (e.g. "bitcoin") → safe keyword (case-insensitive)
 * - Short symbols (≤3 chars) → uppercaseOnly to avoid English word collisions
 * - Long symbols (≥4 chars) → safe keyword
 */
export function buildTokenConfig(
  rows: { symbol: string; name: string }[]
): Record<string, TokenConfig> {
  const config: Record<string, TokenConfig> = {};

  for (const row of rows) {
    const symbol = row.symbol.toLowerCase();
    const name = row.name.toLowerCase();

    const safe: string[] = [];
    const uppercaseOnly: string[] = [];

    // Full token name as safe keyword (always case-insensitive match)
    if (name && name !== symbol) {
      safe.push(name);
    }

    if (symbol.length <= SHORT_SYMBOL_MAX_LEN) {
      // Short symbols collide with English words (e.g. "sol", "dot", "op")
      uppercaseOnly.push(symbol.toUpperCase());
    } else {
      // Longer symbols are safe to match case-insensitively
      safe.push(symbol);
    }

    if (safe.length > 0 || uppercaseOnly.length > 0) {
      config[symbol] = { safe };
      if (uppercaseOnly.length > 0) {
        config[symbol].uppercaseOnly = uppercaseOnly;
      }
    }
  }

  return config;
}

// --- Module-level cache ---

let cachedConfig: Record<string, TokenConfig> | null = null;

/** Get token config, loading from DB on first call (lazy init). */
export function getTokenConfig(db?: Database.Database): Record<string, TokenConfig> {
  if (cachedConfig) return cachedConfig;

  const database = db || getDatabase();
  const rows = database
    .prepare("SELECT symbol, name FROM tokens ORDER BY symbol ASC")
    .all() as { symbol: string; name: string }[];

  cachedConfig = buildTokenConfig(rows);
  return cachedConfig;
}

/** Clear cached config (useful for retag or after DB changes). */
export function resetTokenConfig(): void {
  cachedConfig = null;
}

/** Set config directly — for testing without DB. */
export function setTokenConfig(config: Record<string, TokenConfig>): void {
  cachedConfig = config;
}
