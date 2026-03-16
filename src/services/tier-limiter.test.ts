import { describe, it, expect } from "vitest";
import { TIER_LIMITS, getMaxWatchlistTokens } from "./tier-limiter.js";

describe("tier-limiter", () => {
  it("free tier has correct limits", () => {
    expect(TIER_LIMITS.free.alertsPerDay).toBe(3);
    expect(TIER_LIMITS.free.maxTokens).toBe(20);
    expect(TIER_LIMITS.free.apiAccessEnabled).toBe(false);
  });

  it("pro tier has correct limits", () => {
    expect(TIER_LIMITS.pro.alertsPerDay).toBe(Infinity);
    expect(TIER_LIMITS.pro.maxTokens).toBe(50);
    expect(TIER_LIMITS.pro.apiAccessEnabled).toBe(true);
    expect(TIER_LIMITS.pro.apiRequestsPerDay).toBe(100);
  });

  it("getMaxWatchlistTokens returns correct values", () => {
    expect(getMaxWatchlistTokens("free")).toBe(20);
    expect(getMaxWatchlistTokens("pro")).toBe(50);
  });
});
