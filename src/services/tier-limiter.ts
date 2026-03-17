import type { Response, NextFunction } from "express";
import { UserRepository } from "../db/user-repository.js";
import type { AuthenticatedRequest } from "./auth.js";

/**
 * Tier limits configuration.
 */
export const TIER_LIMITS = {
  free: {
    alertsPerDay: 3,
    maxTokens: 20,
    apiAccessEnabled: false,
    apiRequestsPerDay: 0,
  },
  pro: {
    alertsPerDay: Infinity,
    maxTokens: 50,
    apiAccessEnabled: true,
    apiRequestsPerDay: 100,
  },
} as const;

/**
 * Middleware to enforce API rate limits per user tier.
 * Requires requireAuth to have run first (req.user must be set).
 */
export async function tierApiRateLimit(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const limits = TIER_LIMITS[req.user.tier];

  if (!limits.apiAccessEnabled) {
    res.status(403).json({
      error: "API access requires a Pro subscription",
      upgrade_url: "/billing",
    });
    return;
  }

  const userRepo = new UserRepository();
  const today = new Date().toISOString().split("T")[0];
  const usageCount = await userRepo.getApiUsageCount(req.user.id, today);

  if (usageCount >= limits.apiRequestsPerDay) {
    res.status(429).json({
      error: "Daily API limit reached",
      limit: limits.apiRequestsPerDay,
      resets_at: `${today}T23:59:59Z`,
    });
    return;
  }

  // Record this request
  await userRepo.recordApiUsage(req.user.id, req.path);
  next();
}

/**
 * Check if a user can receive more alerts today.
 */
export async function canReceiveAlert(userId: string, tier: "free" | "pro"): Promise<boolean> {
  if (tier === "pro") return true;
  const userRepo = new UserRepository();
  const count = await userRepo.getDailyAlertCount(userId);
  return count < TIER_LIMITS.free.alertsPerDay;
}

/**
 * Get the max tokens a user can watch based on tier.
 */
export function getMaxWatchlistTokens(tier: "free" | "pro"): number {
  return TIER_LIMITS[tier].maxTokens;
}
