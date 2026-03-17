import { NextResponse } from "next/server";
import { UserRepository } from "@/lib/db/user-repository";
import type { User } from "@/lib/db/user-repository";

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
 * Check API rate limit for a user. Returns null if OK, or a NextResponse if rate-limited.
 */
export async function checkApiRateLimit(user: User, endpoint: string): Promise<NextResponse | null> {
  const limits = TIER_LIMITS[user.tier];

  if (!limits.apiAccessEnabled) {
    return NextResponse.json(
      { error: "API access requires a Pro subscription", upgrade_url: "/billing" },
      { status: 403 }
    );
  }

  const userRepo = new UserRepository();
  const today = new Date().toISOString().split("T")[0];
  const usageCount = await userRepo.getApiUsageCount(user.id, today);

  if (usageCount >= limits.apiRequestsPerDay) {
    return NextResponse.json(
      { error: "Daily API limit reached", limit: limits.apiRequestsPerDay, resets_at: `${today}T23:59:59Z` },
      { status: 429 }
    );
  }

  // Record this request
  await userRepo.recordApiUsage(user.id, endpoint);
  return null;
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
