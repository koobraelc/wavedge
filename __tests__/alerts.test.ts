import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequest, parseResponse, mockUser } from "./test-helpers";

// ── Mocks ──────────────────────────────────────────────────

vi.mock("@/lib/db/database", () => ({
  getPool: vi.fn(() => ({})),
  getSQL: vi.fn(() => vi.fn()),
}));

const mockGetPreferences = vi.fn();
const mockUpsertPreferences = vi.fn();
const mockGetRecentAlerts = vi.fn();
const mockGetAllEnabledPreferences = vi.fn();
const mockInsertTriggeredAlert = vi.fn();
const mockInsertMissedAlert = vi.fn();
const mockHasRecentAlert = vi.fn();
const mockGetDailyMissedAlertCount = vi.fn();
const mockGetRecentMissedAlerts = vi.fn();

vi.mock("@/lib/db/alert-repository", () => {
  return {
    AlertRepository: class {
      getPreferences = mockGetPreferences;
      upsertPreferences = mockUpsertPreferences;
      getRecentAlerts = mockGetRecentAlerts;
      getAllEnabledPreferences = mockGetAllEnabledPreferences;
      insertTriggeredAlert = mockInsertTriggeredAlert;
      insertMissedAlert = mockInsertMissedAlert;
      hasRecentAlert = mockHasRecentAlert;
      getDailyMissedAlertCount = mockGetDailyMissedAlertCount;
      getRecentMissedAlerts = mockGetRecentMissedAlerts;
    },
  };
});

const mockFindById = vi.fn();
const mockGetDailyAlertCount = vi.fn();

vi.mock("@/lib/db/user-repository", () => {
  return {
    UserRepository: class {
      findById = mockFindById;
      getDailyAlertCount = mockGetDailyAlertCount;
      getApiUsageCount = vi.fn().mockResolvedValue(0);
      recordApiUsage = vi.fn();
    },
  };
});

vi.mock("@/lib/db/price-repository", () => {
  return {
    PriceRepository: class {
      getLatestPrices = vi.fn().mockResolvedValue([]);
    },
  };
});

vi.mock("@/lib/db/scheduler-repository", () => {
  return {
    SchedulerRepository: class {
      logError = vi.fn();
    },
  };
});

const mockPushUpsert = vi.fn();
const mockPushGetByUser = vi.fn();
const mockPushRemoveByEndpoint = vi.fn();

vi.mock("@/lib/db/push-repository", () => {
  return {
    PushRepository: class {
      upsert = mockPushUpsert;
      getByUser = mockPushGetByUser;
      removeByEndpoint = mockPushRemoveByEndpoint;
    },
  };
});

vi.mock("@/lib/services/notification-channels", () => ({
  channelRegistry: {
    web: { name: "web", send: vi.fn().mockResolvedValue(true) },
    email: { name: "email", send: vi.fn().mockResolvedValue(true) },
    telegram: { name: "telegram", send: vi.fn().mockResolvedValue(true) },
    push: { name: "push", send: vi.fn().mockResolvedValue(true) },
  },
}));

vi.mock("@/lib/services/tier-limiter", async () => {
  return {
    TIER_LIMITS: {
      free: { alertsPerDay: 3, maxTokens: 20, apiAccessEnabled: false, apiRequestsPerDay: 0 },
      pro: { alertsPerDay: Infinity, maxTokens: 50, apiAccessEnabled: true, apiRequestsPerDay: 100 },
    },
    canReceiveAlert: vi.fn().mockResolvedValue(true),
    checkApiRateLimit: vi.fn().mockResolvedValue(null),
    getMaxWatchlistTokens: vi.fn((tier: string) => tier === "pro" ? 50 : 20),
  };
});

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/db/api-key-repository", () => {
  return {
    ApiKeyRepository: class {
      findByKey = vi.fn().mockResolvedValue(undefined);
    },
  };
});

// ── Tests ──────────────────────────────────────────────────

describe("Alert Preferences API — /api/alerts/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/alerts/preferences", () => {
    it("returns null when no preferences exist", async () => {
      mockGetPreferences.mockResolvedValue(undefined);
      const { GET } = await import("@/app/api/alerts/preferences/route");
      const req = createRequest("/api/alerts/preferences?userId=user-1");
      const { status, body } = await parseResponse(await GET(req));
      expect(status).toBe(200);
      expect(body.data).toBeNull();
    });

    it("returns formatted preferences", async () => {
      mockGetPreferences.mockResolvedValue({
        user_id: "user-1",
        token_symbols: '["btc","eth"]',
        channels: '["email","web"]',
        sensitivity: "medium",
        news_frequency_threshold: 3,
        news_window_minutes: 60,
        price_change_threshold: 5.0,
        volume_change_threshold: 100.0,
        sentiment_change_threshold: 30.0,
        whale_transaction_threshold: 1000000,
        min_signals: 2,
        enabled: 1,
        telegram_chat_id: null,
        email_address: "user@test.com",
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      });

      const { GET } = await import("@/app/api/alerts/preferences/route");
      const req = createRequest("/api/alerts/preferences?userId=user-1");
      const { status, body } = await parseResponse(await GET(req));
      expect(status).toBe(200);
      expect(body.data.userId).toBe("user-1");
      expect(body.data.tokenSymbols).toEqual(["btc", "eth"]);
      expect(body.data.channels).toEqual(["email", "web"]);
      expect(body.data.sensitivity).toBe("medium");
      expect(body.data.enabled).toBe(true);
    });

    it("defaults to 'default' userId when no param", async () => {
      mockGetPreferences.mockResolvedValue(undefined);
      const { GET } = await import("@/app/api/alerts/preferences/route");
      const req = createRequest("/api/alerts/preferences");
      await GET(req);
      expect(mockGetPreferences).toHaveBeenCalledWith("default");
    });
  });

  describe("POST /api/alerts/preferences", () => {
    it("creates preferences with valid input", async () => {
      mockUpsertPreferences.mockResolvedValue({
        user_id: "user-1",
        token_symbols: '["btc","eth"]',
        channels: '["email","web"]',
        sensitivity: "medium",
        news_frequency_threshold: 3,
        news_window_minutes: 60,
        price_change_threshold: 5.0,
        volume_change_threshold: 100.0,
        sentiment_change_threshold: 30.0,
        whale_transaction_threshold: 1000000,
        min_signals: 2,
        enabled: 1,
        telegram_chat_id: null,
        email_address: "user@test.com",
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      });

      const { POST } = await import("@/app/api/alerts/preferences/route");
      const req = createRequest("/api/alerts/preferences", {
        method: "POST",
        body: {
          userId: "user-1",
          tokenSymbols: ["btc", "eth"],
          channels: ["email", "web"],
          sensitivity: "medium",
          emailAddress: "user@test.com",
          minSignals: 2,
        },
      });
      const { status, body } = await parseResponse(await POST(req));
      expect(status).toBe(201);
      expect(body.data.userId).toBe("user-1");
    });

    it("rejects invalid sensitivity", async () => {
      const { POST } = await import("@/app/api/alerts/preferences/route");
      const req = createRequest("/api/alerts/preferences", {
        method: "POST",
        body: { userId: "user-1", sensitivity: "extreme" },
      });
      const { status, body } = await parseResponse(await POST(req));
      expect(status).toBe(400);
      expect(body.error).toContain("Invalid sensitivity");
    });

    it("rejects invalid channel", async () => {
      const { POST } = await import("@/app/api/alerts/preferences/route");
      const req = createRequest("/api/alerts/preferences", {
        method: "POST",
        body: { userId: "user-1", channels: ["sms"] },
      });
      const { status, body } = await parseResponse(await POST(req));
      expect(status).toBe(400);
      expect(body.error).toContain("Invalid channel");
    });

    it("rejects minSignals out of range", async () => {
      const { POST } = await import("@/app/api/alerts/preferences/route");
      const req = createRequest("/api/alerts/preferences", {
        method: "POST",
        body: { userId: "user-1", minSignals: 10 },
      });
      const { status, body } = await parseResponse(await POST(req));
      expect(status).toBe(400);
      expect(body.error).toContain("minSignals");
    });

    it("rejects invalid email", async () => {
      const { POST } = await import("@/app/api/alerts/preferences/route");
      const req = createRequest("/api/alerts/preferences", {
        method: "POST",
        body: { userId: "user-1", emailAddress: "not-an-email" },
      });
      const { status, body } = await parseResponse(await POST(req));
      expect(status).toBe(400);
      expect(body.error).toContain("email");
    });
  });

  describe("PATCH /api/alerts/preferences", () => {
    it("updates existing preferences", async () => {
      mockGetPreferences.mockResolvedValue({
        user_id: "user-1",
        token_symbols: '["btc"]',
        channels: '["web"]',
        sensitivity: "medium",
        min_signals: 2,
        enabled: 1,
      });
      mockUpsertPreferences.mockResolvedValue({
        user_id: "user-1",
        token_symbols: '["btc","eth","sol"]',
        channels: '["web"]',
        sensitivity: "high",
        news_frequency_threshold: 2,
        news_window_minutes: 60,
        price_change_threshold: 2.0,
        volume_change_threshold: 50.0,
        sentiment_change_threshold: 15.0,
        whale_transaction_threshold: 500000,
        min_signals: 2,
        enabled: 1,
        telegram_chat_id: null,
        email_address: null,
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      });

      const { PATCH } = await import("@/app/api/alerts/preferences/route");
      const req = createRequest("/api/alerts/preferences", {
        method: "PATCH",
        body: {
          userId: "user-1",
          tokenSymbols: ["btc", "eth", "sol"],
          sensitivity: "high",
        },
      });
      const { status, body } = await parseResponse(await PATCH(req));
      expect(status).toBe(200);
      expect(body.data.tokenSymbols).toEqual(["btc", "eth", "sol"]);
      expect(body.data.sensitivity).toBe("high");
    });

    it("returns 404 when no existing preferences", async () => {
      mockGetPreferences.mockResolvedValue(undefined);
      const { PATCH } = await import("@/app/api/alerts/preferences/route");
      const req = createRequest("/api/alerts/preferences", {
        method: "PATCH",
        body: { userId: "user-1", sensitivity: "high" },
      });
      const { status } = await parseResponse(await PATCH(req));
      expect(status).toBe(404);
    });
  });
});

describe("Alert History API — /api/alerts/history", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty history for new user", async () => {
    mockGetRecentAlerts.mockResolvedValue([]);
    const { GET } = await import("@/app/api/alerts/history/route");
    const req = createRequest("/api/alerts/history?userId=user-1");
    const { status, body } = await parseResponse(await GET(req));
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("returns formatted alert history", async () => {
    mockGetRecentAlerts.mockResolvedValue([
      {
        id: 1,
        user_id: "user-1",
        token_symbol: "btc",
        signals: '[{"type":"price_movement","value":5.2}]',
        signal_count: 1,
        summary: "BTC price up 5.2%",
        delivered_channels: '["email","web"]',
        created_at: "2026-03-17T00:00:00Z",
      },
    ]);
    const { GET } = await import("@/app/api/alerts/history/route");
    const req = createRequest("/api/alerts/history?userId=user-1&hours=48");
    const { status, body } = await parseResponse(await GET(req));
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].tokenSymbol).toBe("btc");
    expect(body.data[0].signals).toEqual([{ type: "price_movement", value: 5.2 }]);
    expect(body.data[0].deliveredChannels).toEqual(["email", "web"]);
    expect(body.count).toBe(1);
  });

  it("caps hours at 168", async () => {
    mockGetRecentAlerts.mockResolvedValue([]);
    const { GET } = await import("@/app/api/alerts/history/route");
    const req = createRequest("/api/alerts/history?userId=user-1&hours=500");
    await GET(req);
    expect(mockGetRecentAlerts).toHaveBeenCalledWith("user-1", 168);
  });
});

describe("Missed Alerts API — /api/alerts/missed", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns zero missed for pro users", async () => {
    mockFindById.mockResolvedValue(mockUser({ id: "pro-user", tier: "pro" }));
    const { GET } = await import("@/app/api/alerts/missed/route");
    const req = createRequest("/api/alerts/missed?userId=pro-user");
    const { status, body } = await parseResponse(await GET(req));
    expect(status).toBe(200);
    expect(body.data.tier).toBe("pro");
    expect(body.data.missedToday).toBe(0);
    expect(body.data.dailyLimit).toBeNull();
  });

  it("returns missed alerts for free users", async () => {
    mockFindById.mockResolvedValue(mockUser({ id: "free-user", tier: "free" }));
    mockGetDailyMissedAlertCount.mockResolvedValue(2);
    mockGetRecentMissedAlerts.mockResolvedValue([
      {
        id: 1,
        user_id: "free-user",
        token_symbol: "btc",
        signals: '[{"type":"price_movement"}]',
        signal_count: 1,
        summary: "BTC alert missed",
        delivered_channels: "[]",
        created_at: "2026-03-17T00:00:00Z",
      },
    ]);
    mockGetDailyAlertCount.mockResolvedValue(3);

    const { GET } = await import("@/app/api/alerts/missed/route");
    const req = createRequest("/api/alerts/missed?userId=free-user");
    const { status, body } = await parseResponse(await GET(req));
    expect(status).toBe(200);
    expect(body.data.tier).toBe("free");
    expect(body.data.missedToday).toBe(2);
    expect(body.data.dailyLimit).toBe(3);
    expect(body.data.deliveredToday).toBe(3);
    expect(body.data.alerts).toHaveLength(1);
  });
});

describe("Push Subscribe API — /api/alerts/push/subscribe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("subscribes with valid push subscription", async () => {
    mockPushUpsert.mockResolvedValue(undefined);
    const { POST } = await import("@/app/api/alerts/push/subscribe/route");
    const req = createRequest("/api/alerts/push/subscribe", {
      method: "POST",
      body: {
        userId: "user-1",
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/abc",
          keys: { p256dh: "key1", auth: "key2" },
        },
      },
    });
    const { status, body } = await parseResponse(await POST(req));
    expect(status).toBe(201);
    expect(body.data.subscribed).toBe(true);
    expect(mockPushUpsert).toHaveBeenCalledWith(
      "user-1",
      "https://fcm.googleapis.com/fcm/send/abc",
      "key1",
      "key2"
    );
  });

  it("rejects invalid push subscription", async () => {
    const { POST } = await import("@/app/api/alerts/push/subscribe/route");
    const req = createRequest("/api/alerts/push/subscribe", {
      method: "POST",
      body: {
        userId: "user-1",
        subscription: { endpoint: "https://example.com" },
      },
    });
    const { status, body } = await parseResponse(await POST(req));
    expect(status).toBe(400);
    expect(body.error).toContain("Invalid push subscription");
  });
});

describe("Alert Engine — runCycle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty result when no enabled preferences", async () => {
    mockGetAllEnabledPreferences.mockResolvedValue([]);
    const { AlertEngine } = await import("@/lib/services/alert-engine");
    const { AlertRepository } = await import("@/lib/db/alert-repository");
    const { PriceRepository } = await import("@/lib/db/price-repository");
    const engine = new AlertEngine(new AlertRepository(), new PriceRepository());
    const result = await engine.runCycle();
    expect(result.alertsTriggered).toBe(0);
    expect(result.alertsMissed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});

describe("Cron Alert Endpoint — /api/cron/alerts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects requests without CRON_SECRET", async () => {
    process.env.CRON_SECRET = "test-secret";
    const { GET } = await import("@/app/api/cron/alerts/route");
    const req = createRequest("/api/cron/alerts", {
      headers: { authorization: "Bearer wrong-secret" },
    });
    const { status } = await parseResponse(await GET(req));
    expect(status).toBe(401);
  });

  it("runs alert cycle with valid CRON_SECRET", async () => {
    process.env.CRON_SECRET = "test-secret";
    mockGetAllEnabledPreferences.mockResolvedValue([]);
    const { GET } = await import("@/app/api/cron/alerts/route");
    const req = createRequest("/api/cron/alerts", {
      headers: { authorization: "Bearer test-secret" },
    });
    const { status, body } = await parseResponse(await GET(req));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.task).toBe("alerts");
    expect(body.alertsTriggered).toBe(0);
  });
});
