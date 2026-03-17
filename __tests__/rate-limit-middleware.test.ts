import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { createRequest, parseResponse, mockUser } from "./test-helpers";

// ── Mocks ──────────────────────────────────────────────────

vi.mock("@/lib/db/database", () => ({
  getPool: vi.fn(() => ({})),
  getSQL: vi.fn(() => vi.fn()),
}));

const mockGetAuthenticatedUser = vi.fn();
const mockCheckApiRateLimit = vi.fn();

vi.mock("@/lib/services/auth", () => ({
  getAuthenticatedUser: (...args: unknown[]) => mockGetAuthenticatedUser(...args),
  requireAuth: vi.fn(),
  requirePro: vi.fn(),
}));

vi.mock("@/lib/services/tier-limiter", () => ({
  checkApiRateLimit: (...args: unknown[]) => mockCheckApiRateLimit(...args),
  TIER_LIMITS: {
    free: { alertsPerDay: 3, maxTokens: 20, apiAccessEnabled: false, apiRequestsPerDay: 0 },
    pro: { alertsPerDay: Infinity, maxTokens: 50, apiAccessEnabled: true, apiRequestsPerDay: 100 },
  },
  canReceiveAlert: vi.fn(),
  getMaxWatchlistTokens: vi.fn(),
}));

vi.mock("@/lib/db/api-key-repository", () => ({
  ApiKeyRepository: vi.fn().mockImplementation(() => ({
    findByKey: vi.fn(),
  })),
}));

vi.mock("@/lib/db/user-repository", () => ({
  UserRepository: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

// ── Tests ──────────────────────────────────────────────────

describe("withRateLimit middleware", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when user is not authenticated", async () => {
    mockGetAuthenticatedUser.mockResolvedValue(null);

    const { withRateLimit } = await import("@/lib/services/rate-limit-middleware");
    const handler = vi.fn();
    const wrapped = withRateLimit("/api/prices", handler);

    const req = createRequest("/api/prices");
    const { status, body } = await parseResponse(await wrapped(req));
    expect(status).toBe(401);
    expect(body.error).toContain("Authentication required");
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns rate limit response when limit exceeded", async () => {
    const user = mockUser({ tier: "pro" });
    mockGetAuthenticatedUser.mockResolvedValue(user);
    mockCheckApiRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Daily API limit reached" }, { status: 429 })
    );

    const { withRateLimit } = await import("@/lib/services/rate-limit-middleware");
    const handler = vi.fn();
    const wrapped = withRateLimit("/api/prices", handler);

    const req = createRequest("/api/prices", {
      headers: { authorization: "Bearer wv_testkey" },
    });
    const { status, body } = await parseResponse(await wrapped(req));
    expect(status).toBe(429);
    expect(body.error).toContain("limit");
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls handler when auth and rate limit pass", async () => {
    const user = mockUser({ tier: "pro" });
    mockGetAuthenticatedUser.mockResolvedValue(user);
    mockCheckApiRateLimit.mockResolvedValue(null);

    const { withRateLimit } = await import("@/lib/services/rate-limit-middleware");
    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ data: "test" })
    );
    const wrapped = withRateLimit("/api/prices", handler);

    const req = createRequest("/api/prices", {
      headers: { authorization: "Bearer wv_testkey" },
    });
    const { status, body } = await parseResponse(await wrapped(req));
    expect(status).toBe(200);
    expect(body.data).toBe("test");
    expect(handler).toHaveBeenCalledWith(req, user);
  });

  it("blocks free tier from API access", async () => {
    const user = mockUser({ tier: "free" });
    mockGetAuthenticatedUser.mockResolvedValue(user);
    mockCheckApiRateLimit.mockResolvedValue(
      NextResponse.json({ error: "API access requires a Pro subscription" }, { status: 403 })
    );

    const { withRateLimit } = await import("@/lib/services/rate-limit-middleware");
    const handler = vi.fn();
    const wrapped = withRateLimit("/api/prices", handler);

    const req = createRequest("/api/prices", {
      headers: { authorization: "Bearer wv_freekey" },
    });
    const { status, body } = await parseResponse(await wrapped(req));
    expect(status).toBe(403);
    expect(body.error).toContain("Pro subscription");
    expect(handler).not.toHaveBeenCalled();
  });
});
