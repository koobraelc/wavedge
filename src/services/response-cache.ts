import type { Request, Response, NextFunction } from "express";

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

/**
 * Simple in-memory response cache with TTL.
 * Designed for read-heavy API endpoints where data changes on known intervals.
 */
export class ResponseCache {
  private cache = new Map<string, CacheEntry>();

  /** Get a cached value, or undefined if expired/missing */
  get(key: string): unknown | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  /** Set a cached value with TTL in seconds */
  set(key: string, data: unknown, ttlSec: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlSec * 1000,
    });
  }

  /** Invalidate all keys matching a prefix (or exact key) */
  invalidate(keyOrPrefix: string): void {
    for (const key of this.cache.keys()) {
      if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) {
        this.cache.delete(key);
      }
    }
  }

  /** Clear all entries */
  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/** Singleton cache instance shared across all routes */
export const apiCache = new ResponseCache();

/**
 * Express middleware that caches JSON responses by URL path + query.
 * @param ttlSec Cache TTL in seconds
 */
export function cacheMiddleware(ttlSec: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.originalUrl || req.url;
    const cached = apiCache.get(key);

    if (cached !== undefined) {
      res.json(cached);
      return;
    }

    // Intercept res.json to capture the response
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        apiCache.set(key, body, ttlSec);
      }
      return originalJson(body);
    };

    next();
  };
}
