import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRequest, parseResponse } from "./test-helpers";

// ── Mocks ──────────────────────────────────────────────────

vi.mock("@/lib/db/database", () => ({
  getPool: vi.fn(() => ({})),
  getSQL: vi.fn(() => vi.fn()),
}));

const mockSubscribeEmail = vi.fn();
const mockSubscribeTelegram = vi.fn();
const mockUnsubscribeByToken = vi.fn();
const mockUnsubscribeEmail = vi.fn();
const mockGetActiveSubscribers = vi.fn();
const mockGetSubscriberCount = vi.fn();
const mockSaveDigest = vi.fn();
const mockGetRecentDigests = vi.fn();
const mockGetLatestDigest = vi.fn();

vi.mock("@/lib/db/digest-repository", () => {
  return {
    DigestRepository: class {
      subscribeEmail = mockSubscribeEmail;
      subscribeTelegram = mockSubscribeTelegram;
      unsubscribeByToken = mockUnsubscribeByToken;
      unsubscribeEmail = mockUnsubscribeEmail;
      getActiveSubscribers = mockGetActiveSubscribers;
      getSubscriberCount = mockGetSubscriberCount;
      saveDigest = mockSaveDigest;
      getRecentDigests = mockGetRecentDigests;
      getLatestDigest = mockGetLatestDigest;
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

const mockGenerate = vi.fn();

vi.mock("@/lib/services/digest-generator", () => {
  return {
    DigestGenerator: class {
      generate = mockGenerate;
    },
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

vi.mock("@/lib/db/user-repository", () => {
  return {
    UserRepository: class {
      findById = vi.fn().mockResolvedValue(undefined);
    },
  };
});

// ── Tests ──────────────────────────────────────────────────

describe("Digest Subscribe API — /api/digest/subscribe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("subscribes via email", async () => {
    mockSubscribeEmail.mockResolvedValue({
      id: 1,
      email: "test@example.com",
      telegram_chat_id: null,
      lang: "en",
      active: 1,
      unsubscribe_token: "uuid-token",
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    });

    const { POST } = await import("@/app/api/digest/subscribe/route");
    const req = createRequest("/api/digest/subscribe", {
      method: "POST",
      body: { email: "test@example.com", lang: "en" },
    });
    const { status, body } = await parseResponse(await POST(req));
    expect(status).toBe(200);
    expect(body.data.email).toBe("test@example.com");
    expect(body.data.lang).toBe("en");
    expect(body.data.active).toBe(1);
    expect(mockSubscribeEmail).toHaveBeenCalledWith("test@example.com", "en");
  });

  it("subscribes via Telegram", async () => {
    mockSubscribeTelegram.mockResolvedValue({
      id: 2,
      email: null,
      telegram_chat_id: "12345",
      lang: "zh",
      active: 1,
      unsubscribe_token: "uuid-token-2",
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    });

    const { POST } = await import("@/app/api/digest/subscribe/route");
    const req = createRequest("/api/digest/subscribe", {
      method: "POST",
      body: { telegram_chat_id: "12345", lang: "zh" },
    });
    const { status, body } = await parseResponse(await POST(req));
    expect(status).toBe(200);
    expect(body.data.telegram_chat_id).toBe("12345");
    expect(body.data.lang).toBe("zh");
  });

  it("rejects subscribe without email or telegram", async () => {
    const { POST } = await import("@/app/api/digest/subscribe/route");
    const req = createRequest("/api/digest/subscribe", {
      method: "POST",
      body: { lang: "en" },
    });
    const { status, body } = await parseResponse(await POST(req));
    expect(status).toBe(400);
    expect(body.error).toBeDefined();
  });
});

describe("Digest Unsubscribe API — /api/digest/unsubscribe", () => {
  beforeEach(() => vi.clearAllMocks());

  it("unsubscribes via token (GET) and returns HTML", async () => {
    mockUnsubscribeByToken.mockResolvedValue(true);
    const { GET } = await import("@/app/api/digest/unsubscribe/route");
    const req = createRequest("/api/digest/unsubscribe?token=uuid-token");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html");
    const html = await res.text();
    expect(html).toContain("Unsubscribed");
    expect(mockUnsubscribeByToken).toHaveBeenCalledWith("uuid-token");
  });

  it("unsubscribes via email (POST)", async () => {
    mockUnsubscribeEmail.mockResolvedValue(true);
    const { POST } = await import("@/app/api/digest/unsubscribe/route");
    const req = createRequest("/api/digest/unsubscribe", {
      method: "POST",
      body: { email: "test@example.com" },
    });
    const { status, body } = await parseResponse(await POST(req));
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

describe("Digest Subscribers API — /api/digest/subscribers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns subscriber count", async () => {
    mockGetSubscriberCount.mockResolvedValue({ active: 5, total: 8 });
    const { GET } = await import("@/app/api/digest/subscribers/route");
    const req = createRequest("/api/digest/subscribers");
    const { status, body } = await parseResponse(await GET());
    expect(status).toBe(200);
    expect(body.data.active).toBe(5);
    expect(body.data.total).toBe(8);
  });
});

describe("Digest History API — /api/digest/history", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns recent digest history", async () => {
    mockGetRecentDigests.mockResolvedValue([
      {
        id: 1,
        lang: "en",
        subject: "Daily Crypto Digest — Mar 17",
        content_html: "<h1>Digest</h1>",
        content_telegram: "**Digest**",
        emails_sent: 15,
        telegrams_sent: 5,
        generated_at: "2026-03-17T08:00:00Z",
      },
    ]);

    const { GET } = await import("@/app/api/digest/history/route");
    const req = createRequest("/api/digest/history");
    const { status, body } = await parseResponse(await GET(req));
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].emails_sent).toBe(15);
  });
});

describe("Digest Latest API — /api/digest/latest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns latest digest for language", async () => {
    mockGetLatestDigest.mockResolvedValue({
      id: 1,
      lang: "en",
      subject: "Daily Crypto Digest",
      content_html: "<h1>Digest</h1>",
      content_telegram: "**Digest**",
      emails_sent: 10,
      telegrams_sent: 3,
      generated_at: "2026-03-17T08:00:00Z",
    });

    const { GET } = await import("@/app/api/digest/latest/route");
    const req = createRequest("/api/digest/latest?lang=en");
    const { status, body } = await parseResponse(await GET(req));
    expect(status).toBe(200);
    expect(body.data.lang).toBe("en");
    expect(body.data.subject).toContain("Digest");
  });

  it("returns 404 when no digest exists", async () => {
    mockGetLatestDigest.mockResolvedValue(undefined);
    const { GET } = await import("@/app/api/digest/latest/route");
    const req = createRequest("/api/digest/latest?lang=en");
    const { status, body } = await parseResponse(await GET(req));
    expect(status).toBe(404);
    expect(body.error).toContain("No digest found");
  });
});

describe("Cron Digest Endpoint — /api/cron/digest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects requests without CRON_SECRET", async () => {
    process.env.CRON_SECRET = "test-secret";
    const { GET } = await import("@/app/api/cron/digest/route");
    const req = createRequest("/api/cron/digest", {
      headers: { authorization: "Bearer wrong-secret" },
    });
    const { status } = await parseResponse(await GET(req));
    expect(status).toBe(401);
  });

  it("runs digest pipeline with valid CRON_SECRET", async () => {
    process.env.CRON_SECRET = "test-secret";
    mockGetActiveSubscribers.mockResolvedValue([]);

    const { GET } = await import("@/app/api/cron/digest/route");
    const req = createRequest("/api/cron/digest", {
      headers: { authorization: "Bearer test-secret" },
    });
    const { status, body } = await parseResponse(await GET(req));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.task).toBe("digest");
  });
});

describe("DigestDelivery Service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips languages with no subscribers", async () => {
    mockGetActiveSubscribers.mockResolvedValue([]);

    const { DigestDelivery } = await import("@/lib/services/digest-delivery");
    const { DigestGenerator } = await import("@/lib/services/digest-generator");
    const { DigestRepository } = await import("@/lib/db/digest-repository");

    const delivery = new DigestDelivery(new DigestGenerator(), new DigestRepository());
    const results = await delivery.runDaily();

    expect(results).toHaveLength(0);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it("generates and delivers digest to email subscribers", async () => {
    mockGetActiveSubscribers.mockImplementation(async (lang: string) => {
      if (lang === "en") {
        return [
          { id: 1, email: "user@test.com", telegram_chat_id: null, lang: "en", active: 1, unsubscribe_token: "tok1" },
        ];
      }
      return [];
    });

    mockGenerate.mockResolvedValue({
      subject: "Daily Digest",
      bodyHtml: "<h1>Test</h1>",
      bodyTelegram: "**Test**",
      generatedAt: "2026-03-17T08:00:00Z",
      lang: "en",
    });

    mockSaveDigest.mockResolvedValue(1);

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "email-1" }),
    });
    process.env.RESEND_API_KEY = "test-resend-key";

    const { DigestDelivery } = await import("@/lib/services/digest-delivery");
    const { DigestGenerator } = await import("@/lib/services/digest-generator");
    const { DigestRepository } = await import("@/lib/db/digest-repository");

    const delivery = new DigestDelivery(new DigestGenerator(), new DigestRepository());
    const results = await delivery.runDaily();

    expect(results).toHaveLength(1);
    expect(results[0].lang).toBe("en");
    expect(results[0].emailsSent).toBe(1);
    expect(mockSaveDigest).toHaveBeenCalled();

    global.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
  });

  it("delivers digest via Telegram", async () => {
    mockGetActiveSubscribers.mockImplementation(async (lang: string) => {
      if (lang === "zh") {
        return [
          { id: 1, email: null, telegram_chat_id: "12345", lang: "zh", active: 1, unsubscribe_token: "tok1" },
        ];
      }
      return [];
    });

    mockGenerate.mockResolvedValue({
      subject: "每日摘要",
      bodyHtml: "<h1>測試</h1>",
      bodyTelegram: "**測試**",
      generatedAt: "2026-03-17T08:00:00Z",
      lang: "zh",
    });

    mockSaveDigest.mockResolvedValue(1);

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";

    const { DigestDelivery } = await import("@/lib/services/digest-delivery");
    const { DigestGenerator } = await import("@/lib/services/digest-generator");
    const { DigestRepository } = await import("@/lib/db/digest-repository");

    const delivery = new DigestDelivery(new DigestGenerator(), new DigestRepository());
    const results = await delivery.runDaily();

    expect(results).toHaveLength(1);
    expect(results[0].lang).toBe("zh");
    expect(results[0].telegramsSent).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("api.telegram.org"),
      expect.any(Object)
    );

    global.fetch = originalFetch;
    delete process.env.TELEGRAM_BOT_TOKEN;
  });
});
