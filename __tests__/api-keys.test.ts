import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequest, parseResponse, mockUser } from "./test-helpers";

// ── Mocks ──────────────────────────────────────────────────

vi.mock("@/lib/db/database", () => ({
  getPool: vi.fn(() => ({})),
  getSQL: vi.fn(() => vi.fn()),
}));

const mockListByUser = vi.fn();
const mockCountActive = vi.fn();
const mockApiKeyCreate = vi.fn();
const mockRevoke = vi.fn();
const mockFindByKey = vi.fn();
const mockTouchLastUsed = vi.fn();

vi.mock("@/lib/db/api-key-repository", () => {
  return {
    ApiKeyRepository: class {
      listByUser = mockListByUser;
      countActive = mockCountActive;
      create = mockApiKeyCreate;
      revoke = mockRevoke;
      findByKey = mockFindByKey;
      touchLastUsed = mockTouchLastUsed;
    },
  };
});

const mockFindById = vi.fn();
const mockGetApiUsageCount = vi.fn();
const mockRecordApiUsage = vi.fn();

vi.mock("@/lib/db/user-repository", () => {
  return {
    UserRepository: class {
      findById = mockFindById;
      getApiUsageCount = mockGetApiUsageCount;
      recordApiUsage = mockRecordApiUsage;
      getDailyAlertCount = vi.fn().mockResolvedValue(0);
    },
  };
});

// Mock auth to return a pro user by default
const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => mockAuth(),
}));

// ── Helpers ────────────────────────────────────────────────

function setupProUser() {
  const user = mockUser({ id: "pro-user-1", tier: "pro" });
  mockAuth.mockResolvedValue({ user: { id: user.id } });
  mockFindById.mockResolvedValue(user);
  return user;
}

function setupFreeUser() {
  const user = mockUser({ id: "free-user-1", tier: "free" });
  mockAuth.mockResolvedValue({ user: { id: user.id } });
  mockFindById.mockResolvedValue(user);
  return user;
}

// ── Tests ──────────────────────────────────────────────────

describe("API Keys — /api/api-keys", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("GET /api/api-keys (list keys)", () => {
    it("returns sanitized key list for pro user", async () => {
      setupProUser();
      mockListByUser.mockResolvedValue([
        {
          id: "key-1",
          user_id: "pro-user-1",
          key_hash: "abc123",
          key_prefix: "wv_abc123",
          name: "My Key",
          created_at: "2026-01-01",
          last_used_at: "2026-03-17",
          revoked_at: null,
        },
      ]);

      const { GET } = await import("@/app/api/api-keys/route");
      const req = createRequest("/api/api-keys");
      const { status, body } = await parseResponse(await GET(req));
      expect(status).toBe(200);
      expect(body.keys).toHaveLength(1);
      expect(body.keys[0].id).toBe("key-1");
      expect(body.keys[0].key_prefix).toBe("wv_abc123");
      // Should NOT include key_hash
      expect(body.keys[0].key_hash).toBeUndefined();
    });

    it("returns 401 for unauthenticated user", async () => {
      mockAuth.mockResolvedValue(null);
      const { GET } = await import("@/app/api/api-keys/route");
      const req = createRequest("/api/api-keys");
      const { status } = await parseResponse(await GET(req));
      expect(status).toBe(401);
    });

    it("returns 403 for free tier user", async () => {
      setupFreeUser();
      const { GET } = await import("@/app/api/api-keys/route");
      const req = createRequest("/api/api-keys");
      const { status } = await parseResponse(await GET(req));
      expect(status).toBe(403);
    });
  });

  describe("POST /api/api-keys (create key)", () => {
    it("creates a new API key for pro user", async () => {
      setupProUser();
      mockCountActive.mockResolvedValue(0);
      mockApiKeyCreate.mockResolvedValue({
        key: "wv_testkey123",
        record: {
          id: "key-new",
          user_id: "pro-user-1",
          key_prefix: "wv_testke",
          name: "My New Key",
          created_at: "2026-03-17",
        },
      });

      const { POST } = await import("@/app/api/api-keys/route");
      const req = createRequest("/api/api-keys", {
        method: "POST",
        body: { name: "My New Key" },
      });
      const { status, body } = await parseResponse(await POST(req));
      expect(status).toBe(201);
      expect(body.key).toBe("wv_testkey123");
      expect(body.id).toBe("key-new");
      expect(body.name).toBe("My New Key");
    });

    it("rejects when max keys reached", async () => {
      setupProUser();
      mockCountActive.mockResolvedValue(5);

      const { POST } = await import("@/app/api/api-keys/route");
      const req = createRequest("/api/api-keys", {
        method: "POST",
        body: { name: "One too many" },
      });
      const { status, body } = await parseResponse(await POST(req));
      expect(status).toBe(400);
      expect(body.error).toContain("Maximum");
    });

    it("defaults name to 'Default' when not provided", async () => {
      setupProUser();
      mockCountActive.mockResolvedValue(0);
      mockApiKeyCreate.mockResolvedValue({
        key: "wv_x",
        record: { id: "k", user_id: "pro-user-1", key_prefix: "wv_x", name: "Default", created_at: "2026-01-01" },
      });

      const { POST } = await import("@/app/api/api-keys/route");
      const req = createRequest("/api/api-keys", { method: "POST", body: {} });
      await POST(req);
      expect(mockApiKeyCreate).toHaveBeenCalledWith("pro-user-1", "Default");
    });
  });
});

describe("API Key Revoke — /api/api-keys/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("revokes an owned key", async () => {
    setupProUser();
    mockRevoke.mockResolvedValue(true);

    const { DELETE } = await import("@/app/api/api-keys/[id]/route");
    const req = createRequest("/api/api-keys/key-1", { method: "DELETE" });
    const { status, body } = await parseResponse(
      await DELETE(req, { params: Promise.resolve({ id: "key-1" }) })
    );
    expect(status).toBe(200);
    expect(body.message).toContain("revoked");
    expect(mockRevoke).toHaveBeenCalledWith("key-1", "pro-user-1");
  });

  it("returns 404 for non-existent key", async () => {
    setupProUser();
    mockRevoke.mockResolvedValue(false);

    const { DELETE } = await import("@/app/api/api-keys/[id]/route");
    const req = createRequest("/api/api-keys/bad-id", { method: "DELETE" });
    const { status } = await parseResponse(
      await DELETE(req, { params: Promise.resolve({ id: "bad-id" }) })
    );
    expect(status).toBe(404);
  });
});

describe("API Key Usage — /api/api-keys/usage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns usage stats for pro user", async () => {
    setupProUser();
    mockGetApiUsageCount.mockResolvedValue(42);
    mockCountActive.mockResolvedValue(2);

    const { GET } = await import("@/app/api/api-keys/usage/route");
    const req = createRequest("/api/api-keys/usage");
    const { status, body } = await parseResponse(await GET(req));
    expect(status).toBe(200);
    expect(body.usage_today).toBe(42);
    expect(body.daily_limit).toBe(100);
    expect(body.active_keys).toBe(2);
    expect(body.max_keys).toBe(5);
  });
});

describe("Tier Limiter Service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks free tier API access", async () => {
    const { checkApiRateLimit } = await import("@/lib/services/tier-limiter");
    const freeUser = mockUser({ tier: "free" }) as any;
    const result = await checkApiRateLimit(freeUser, "/api/prices");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("allows pro tier API access", async () => {
    mockGetApiUsageCount.mockResolvedValue(0);
    const { checkApiRateLimit } = await import("@/lib/services/tier-limiter");
    const proUser = mockUser({ tier: "pro" }) as any;
    const result = await checkApiRateLimit(proUser, "/api/prices");
    expect(result).toBeNull();
    expect(mockRecordApiUsage).toHaveBeenCalledWith("user-test-1", "/api/prices");
  });

  it("rate limits pro user at daily cap", async () => {
    mockGetApiUsageCount.mockResolvedValue(100);
    const { checkApiRateLimit } = await import("@/lib/services/tier-limiter");
    const proUser = mockUser({ tier: "pro" }) as any;
    const result = await checkApiRateLimit(proUser, "/api/prices");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it("tier limits are correctly configured", async () => {
    const { TIER_LIMITS } = await import("@/lib/services/tier-limiter");
    expect(TIER_LIMITS.free.alertsPerDay).toBe(3);
    expect(TIER_LIMITS.free.apiAccessEnabled).toBe(false);
    expect(TIER_LIMITS.pro.alertsPerDay).toBe(Infinity);
    expect(TIER_LIMITS.pro.apiRequestsPerDay).toBe(100);
  });
});

describe("Auth Service — API key flow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("authenticates via wv_ API key", async () => {
    const user = mockUser({ id: "api-user", tier: "pro" });
    mockFindByKey.mockResolvedValue({ id: "key-1", user_id: "api-user" });
    mockFindById.mockResolvedValue(user);
    mockTouchLastUsed.mockResolvedValue(undefined);

    const { getAuthenticatedUser } = await import("@/lib/services/auth");
    const req = createRequest("/api/test", {
      headers: { authorization: "Bearer wv_testapikey123" },
    });
    const result = await getAuthenticatedUser(req);
    expect(result).not.toBeNull();
    expect(result!.id).toBe("api-user");
    expect(mockFindByKey).toHaveBeenCalledWith("wv_testapikey123");
    expect(mockTouchLastUsed).toHaveBeenCalledWith("key-1");
  });

  it("returns null for invalid API key", async () => {
    mockFindByKey.mockResolvedValue(undefined);

    const { getAuthenticatedUser } = await import("@/lib/services/auth");
    const req = createRequest("/api/test", {
      headers: { authorization: "Bearer wv_invalid" },
    });
    const result = await getAuthenticatedUser(req);
    expect(result).toBeNull();
  });

  it("requirePro returns 403 for free user", async () => {
    setupFreeUser();
    const { requirePro } = await import("@/lib/services/auth");
    const req = createRequest("/api/test");
    const result = await requirePro(req);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
  });
});
