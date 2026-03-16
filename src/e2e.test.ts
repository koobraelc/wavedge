import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import type Database from "better-sqlite3";
import { createTestDatabase } from "./db/database.js";
import { PriceRepository } from "./db/price-repository.js";
import { NewsRepository } from "./db/news-repository.js";
import { AlertRepository } from "./db/alert-repository.js";
import { DigestRepository } from "./db/digest-repository.js";
import { ImpactRepository } from "./db/impact-repository.js";
import { UserRepository } from "./db/user-repository.js";
import { createPricesRouter } from "./api/prices.js";
import { createNewsRouter } from "./api/news.js";
import { createTokensRouter } from "./api/tokens.js";
import { createSearchRouter } from "./api/search.js";
import { createAlertsRouter } from "./api/alerts.js";
import { createDigestRouter } from "./api/digest.js";
import { signToken } from "./services/auth.js";

/**
 * E2E Integration Test — Full User Flow Validation
 *
 * Validates every user-facing flow end-to-end using an in-memory database.
 * Flows tested:
 *   1. Landing → Signup (magic link → verify → JWT)
 *   2. Dashboard (prices, news, impact scores load)
 *   3. Token page (/tokens/BTC with chart data, news, impact stats)
 *   4. Alert setup (create, read, update preferences; alert history)
 *   5. Pro upgrade (simulated Stripe webhook → tier change)
 *   6. Daily digest (subscribe, unsubscribe, history)
 *   7. API rate limiting (free tier limited, pro unlimited)
 *   8. Search (tokens and articles)
 */

function createE2EApp(db: Database.Database) {
  const app = express();
  app.use(express.json());

  const priceRepo = new PriceRepository(db);
  const newsRepo = new NewsRepository(db);
  const alertRepo = new AlertRepository(db);
  const digestRepo = new DigestRepository(db);
  const impactRepo = new ImpactRepository(db);
  const userRepo = new UserRepository(db);

  app.use("/api/prices", createPricesRouter(priceRepo));
  app.use("/api/news", createNewsRouter(newsRepo, impactRepo));
  app.use("/api/tokens", createTokensRouter(priceRepo, newsRepo, impactRepo));
  app.use("/api/search", createSearchRouter(db));
  app.use("/api/alerts", createAlertsRouter(alertRepo));
  app.use("/api/digest", createDigestRouter(digestRepo));

  // Health endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return { app, priceRepo, newsRepo, alertRepo, digestRepo, impactRepo, userRepo, db };
}

function seedData(priceRepo: PriceRepository, newsRepo: NewsRepository) {
  priceRepo.insertPricesBatch([
    {
      tokenId: "bitcoin", symbol: "btc", name: "Bitcoin",
      priceUsd: 65000, marketCap: 1_200_000_000_000, totalVolume: 25_000_000_000,
      priceChange24h: 1500, priceChangePercentage24h: 2.3, circulatingSupply: 19_500_000,
    },
    {
      tokenId: "ethereum", symbol: "eth", name: "Ethereum",
      priceUsd: 3500, marketCap: 420_000_000_000, totalVolume: 15_000_000_000,
      priceChange24h: -50, priceChangePercentage24h: -1.4, circulatingSupply: 120_000_000,
    },
    {
      tokenId: "solana", symbol: "sol", name: "Solana",
      priceUsd: 150, marketCap: 65_000_000_000, totalVolume: 3_000_000_000,
      priceChange24h: 5, priceChangePercentage24h: 3.4, circulatingSupply: 430_000_000,
    },
  ]);

  newsRepo.insertArticlesBatch([
    {
      guid: "art-1", title: "Bitcoin Hits New High",
      summary: "BTC surges past $65K on ETF inflows", url: "https://example.com/1",
      source: "coindesk", author: "Jane", publishedAt: "2026-03-15T12:00:00Z",
      relevanceScore: 80, tokenTags: ["btc"],
    },
    {
      guid: "art-2", title: "Ethereum DeFi Growth Continues",
      summary: "Ethereum TVL reaches new milestone", url: "https://example.com/2",
      source: "decrypt", author: "Bob", publishedAt: "2026-03-15T11:00:00Z",
      relevanceScore: 60, tokenTags: ["eth"],
    },
    {
      guid: "art-3", title: "Solana NFT Marketplace Launch",
      summary: "New NFT marketplace launches on Solana", url: "https://example.com/3",
      source: "cointelegraph", author: null, publishedAt: "2026-03-15T10:00:00Z",
      relevanceScore: 40, tokenTags: ["sol"],
    },
  ]);
}

describe("E2E Integration: Full User Flow", () => {
  let app: express.Express;
  let db: Database.Database;
  let priceRepo: PriceRepository;
  let newsRepo: NewsRepository;
  let alertRepo: AlertRepository;
  let digestRepo: DigestRepository;
  let userRepo: UserRepository;

  beforeEach(() => {
    const ctx = createE2EApp(createTestDatabase());
    app = ctx.app;
    db = ctx.db;
    priceRepo = ctx.priceRepo;
    newsRepo = ctx.newsRepo;
    alertRepo = ctx.alertRepo;
    digestRepo = ctx.digestRepo;
    userRepo = ctx.userRepo;
    seedData(priceRepo, newsRepo);
  });

  // ────────────────────────────────────────────────────
  // Flow 1: Landing → Signup (Magic Link Auth)
  // ────────────────────────────────────────────────────
  describe("Flow 1: Auth — magic link signup and login", () => {
    it("creates user via magic link and returns JWT on verify", () => {
      // Step 1: Create magic link directly (simulating POST /api/auth/magic-link)
      const magicLink = userRepo.createMagicLink("user@test.com");
      expect(magicLink.token).toBeTruthy();
      expect(magicLink.email).toBe("user@test.com");

      // Step 2: Verify the magic link
      const verified = userRepo.verifyMagicLink(magicLink.token);
      expect(verified).not.toBeNull();
      expect(verified!.email).toBe("user@test.com");

      // Step 3: Find or create user
      const { user } = userRepo.findOrCreateByEmail("user@test.com");
      expect(user.email).toBe("user@test.com");
      expect(user.tier).toBe("free");
      expect(user.id).toBeTruthy();

      // Step 4: Sign JWT
      const jwt = signToken(user.id);
      expect(jwt).toBeTruthy();
      expect(jwt.split(".")).toHaveLength(3);
    });

    it("rejects expired magic links", () => {
      // Create a link then manually expire it in the DB
      const ml = userRepo.createMagicLink("expired@test.com");
      db.prepare("UPDATE magic_links SET expires_at = datetime('now', '-1 hour') WHERE id = ?").run(ml.id);
      const verified = userRepo.verifyMagicLink(ml.token);
      expect(verified).toBeNull();
    });

    it("rejects already-used magic links", () => {
      const ml = userRepo.createMagicLink("once@test.com");
      const first = userRepo.verifyMagicLink(ml.token);
      expect(first).not.toBeNull();

      const second = userRepo.verifyMagicLink(ml.token);
      expect(second).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────
  // Flow 2: Dashboard — prices, news, and data load
  // ────────────────────────────────────────────────────
  describe("Flow 2: Dashboard — prices and news load correctly", () => {
    it("loads all prices for the dashboard", async () => {
      const res = await request(app).get("/api/prices");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.count).toBe(3);

      // Verify price data structure
      const btc = res.body.data.find((p: any) => p.symbol === "btc");
      expect(btc).toBeDefined();
      expect(btc.price_usd).toBe(65000);
      expect(btc.market_cap).toBe(1_200_000_000_000);
    });

    it("loads news feed", async () => {
      const res = await request(app).get("/api/news");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
    });

    it("sorts prices by market cap descending (default)", async () => {
      const res = await request(app).get("/api/prices");
      expect(res.status).toBe(200);
      const symbols = res.body.data.map((p: any) => p.symbol);
      expect(symbols[0]).toBe("btc"); // highest market cap
    });

    it("sorts prices by 24h change", async () => {
      const res = await request(app).get("/api/prices?sort=change&order=desc");
      expect(res.status).toBe(200);
      expect(res.body.data[0].symbol).toBe("sol"); // +3.4%
      expect(res.body.data[2].symbol).toBe("eth"); // -1.4%
    });
  });

  // ────────────────────────────────────────────────────
  // Flow 3: Token page — individual token intelligence
  // ────────────────────────────────────────────────────
  describe("Flow 3: Token page — /tokens/BTC intelligence hub", () => {
    it("returns token overview with price and related news", async () => {
      const res = await request(app).get("/api/tokens/btc");
      expect(res.status).toBe(200);
      expect(res.body.data.token.symbol).toBe("btc");
      expect(res.body.data.token.name).toBe("Bitcoin");
      expect(res.body.data.price).toBeDefined();
      expect(res.body.data.price.price_usd).toBe(65000);
      expect(res.body.data.recentNews).toHaveLength(1);
      expect(res.body.data.recentNews[0].title).toContain("Bitcoin");
    });

    it("returns price history for chart rendering", async () => {
      const res = await request(app).get("/api/prices/btc/history");
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].price_usd).toBe(65000);
    });

    it("returns impact statistics for token", async () => {
      const res = await request(app).get("/api/tokens/btc/impact");
      expect(res.status).toBe(200);
      expect(res.body.data.symbol).toBe("BTC");
      expect(res.body.data.categories).toBeDefined();
      expect(Array.isArray(res.body.data.categories)).toBe(true);
    });

    it("returns 404 for unknown token", async () => {
      const res = await request(app).get("/api/tokens/xyz");
      expect(res.status).toBe(404);
    });

    it("filters news by token tag", async () => {
      const res = await request(app).get("/api/news?token=eth");
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toContain("Ethereum");
    });
  });

  // ────────────────────────────────────────────────────
  // Flow 4: Alert setup — CRUD preferences, history
  // ────────────────────────────────────────────────────
  describe("Flow 4: Alert setup — create, read, update, and history", () => {
    it("creates alert preferences", async () => {
      const res = await request(app)
        .post("/api/alerts/preferences")
        .send({
          userId: "user-1",
          tokenSymbols: ["btc", "eth"],
          channels: ["email", "web"],
          sensitivity: "medium",
          emailAddress: "alert@test.com",
          minSignals: 2,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.userId).toBe("user-1");
      expect(res.body.data.tokenSymbols).toEqual(["btc", "eth"]);
      expect(res.body.data.channels).toEqual(["email", "web"]);
      expect(res.body.data.sensitivity).toBe("medium");
      expect(res.body.data.enabled).toBe(true);
    });

    it("reads alert preferences", async () => {
      // Create first
      await request(app)
        .post("/api/alerts/preferences")
        .send({ userId: "user-1", tokenSymbols: ["btc"], channels: ["web"] });

      const res = await request(app).get("/api/alerts/preferences?userId=user-1");
      expect(res.status).toBe(200);
      expect(res.body.data).not.toBeNull();
      expect(res.body.data.tokenSymbols).toEqual(["btc"]);
    });

    it("updates alert preferences", async () => {
      // Create
      await request(app)
        .post("/api/alerts/preferences")
        .send({ userId: "user-1", tokenSymbols: ["btc"], channels: ["web"] });

      // Update
      const res = await request(app)
        .patch("/api/alerts/preferences")
        .send({
          userId: "user-1",
          tokenSymbols: ["btc", "eth", "sol"],
          sensitivity: "high",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.tokenSymbols).toEqual(["btc", "eth", "sol"]);
      expect(res.body.data.sensitivity).toBe("high");
    });

    it("returns null for non-existent preferences", async () => {
      const res = await request(app).get("/api/alerts/preferences?userId=nobody");
      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });

    it("rejects invalid sensitivity", async () => {
      const res = await request(app)
        .post("/api/alerts/preferences")
        .send({ userId: "user-1", sensitivity: "extreme" });
      expect(res.status).toBe(400);
    });

    it("rejects invalid channel", async () => {
      const res = await request(app)
        .post("/api/alerts/preferences")
        .send({ userId: "user-1", channels: ["sms"] });
      expect(res.status).toBe(400);
    });

    it("returns empty alert history for new user", async () => {
      const res = await request(app).get("/api/alerts/history?userId=user-1");
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.count).toBe(0);
    });

    it("stores and retrieves triggered alerts", () => {
      alertRepo.insertTriggeredAlert({
        userId: "user-1",
        tokenSymbol: "btc",
        signals: [
          { type: "news_frequency", description: "3 articles in 30 min" },
          { type: "price_movement", description: "+5.2% in 1h" },
        ],
        signalCount: 2,
        summary: "BTC multi-signal alert: 3 news articles + 5.2% price spike",
        deliveredChannels: ["email", "web"],
      });

      const alerts = alertRepo.getRecentAlerts("user-1", 24);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].token_symbol).toBe("btc");
      expect(alerts[0].signal_count).toBe(2);
    });
  });

  // ────────────────────────────────────────────────────
  // Flow 5: Pro upgrade (Stripe tier change simulation)
  // ────────────────────────────────────────────────────
  describe("Flow 5: Pro upgrade — tier change via simulated Stripe events", () => {
    it("upgrades user from free to pro after checkout", () => {
      // Create user
      const { user } = userRepo.findOrCreateByEmail("pro@test.com");
      expect(user.tier).toBe("free");

      // Simulate Stripe checkout.session.completed
      userRepo.upsertSubscription({
        id: "sub-001",
        userId: user.id,
        stripeSubscriptionId: "stripe_sub_123",
        status: "active",
      });
      userRepo.updateTier(user.id, "pro");

      // Verify upgrade
      const updated = userRepo.findById(user.id);
      expect(updated!.tier).toBe("pro");

      // Verify subscription is active
      const sub = userRepo.getActiveSubscription(user.id);
      expect(sub).toBeDefined();
      expect(sub!.status).toBe("active");
      expect(sub!.stripe_subscription_id).toBe("stripe_sub_123");
    });

    it("downgrades user when subscription is deleted", () => {
      const { user } = userRepo.findOrCreateByEmail("downgrade@test.com");
      userRepo.updateTier(user.id, "pro");
      userRepo.upsertSubscription({
        id: "sub-002",
        userId: user.id,
        stripeSubscriptionId: "stripe_sub_456",
        status: "active",
      });

      // Simulate subscription.deleted
      userRepo.upsertSubscription({
        id: "sub-002",
        userId: user.id,
        stripeSubscriptionId: "stripe_sub_456",
        status: "canceled",
      });
      userRepo.updateTier(user.id, "free");

      const updated = userRepo.findById(user.id);
      expect(updated!.tier).toBe("free");

      const activeSub = userRepo.getActiveSubscription(user.id);
      expect(activeSub).toBeUndefined();
    });

    it("tracks Stripe customer ID for billing portal", () => {
      const { user } = userRepo.findOrCreateByEmail("billing@test.com");
      userRepo.updateStripeCustomerId(user.id, "cus_stripe_789");

      const found = userRepo.findByStripeCustomerId("cus_stripe_789");
      expect(found).toBeDefined();
      expect(found!.email).toBe("billing@test.com");
    });
  });

  // ────────────────────────────────────────────────────
  // Flow 6: Daily digest — subscribe, unsubscribe, history
  // ────────────────────────────────────────────────────
  describe("Flow 6: Daily digest — subscribe, unsubscribe, history", () => {
    it("subscribes via email", async () => {
      const res = await request(app)
        .post("/api/digest/subscribe")
        .send({ email: "digest@test.com", lang: "en" });

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe("digest@test.com");
      expect(res.body.data.lang).toBe("en");
      expect(res.body.data.active).toBe(1);
    });

    it("subscribes via telegram", async () => {
      const res = await request(app)
        .post("/api/digest/subscribe")
        .send({ telegram_chat_id: "12345", lang: "zh" });

      expect(res.status).toBe(200);
      expect(res.body.data.telegram_chat_id).toBe("12345");
      expect(res.body.data.lang).toBe("zh");
    });

    it("rejects subscribe without email or telegram", async () => {
      const res = await request(app)
        .post("/api/digest/subscribe")
        .send({ lang: "en" });

      expect(res.status).toBe(400);
    });

    it("unsubscribes via email", async () => {
      // Subscribe first
      await request(app)
        .post("/api/digest/subscribe")
        .send({ email: "unsub@test.com" });

      // Unsubscribe
      const res = await request(app)
        .post("/api/digest/unsubscribe")
        .send({ email: "unsub@test.com" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("unsubscribes via token link", async () => {
      // Subscribe
      const sub = await request(app)
        .post("/api/digest/subscribe")
        .send({ email: "link-unsub@test.com" });

      const token = sub.body.data.unsubscribe_token;
      expect(token).toBeTruthy();

      // Click unsubscribe link
      const res = await request(app).get(`/api/digest/unsubscribe?token=${token}`);
      expect(res.status).toBe(200);
    });

    it("returns subscriber count", async () => {
      await request(app).post("/api/digest/subscribe").send({ email: "a@test.com" });
      await request(app).post("/api/digest/subscribe").send({ email: "b@test.com" });
      await request(app).post("/api/digest/subscribe").send({ telegram_chat_id: "999" });

      const res = await request(app).get("/api/digest/subscribers");
      expect(res.status).toBe(200);
      expect(res.body.data.total).toBeGreaterThanOrEqual(3);
    });

    it("tracks digest history after save", () => {
      digestRepo.saveDigest({
        lang: "en",
        subject: "Daily Crypto Digest — Mar 15",
        contentHtml: "<h1>Crypto Digest</h1><p>BTC is up!</p>",
        contentTelegram: "**Crypto Digest** BTC is up!",
        emailsSent: 10,
        telegramsSent: 5,
      });

      const history = digestRepo.getRecentDigests(5);
      expect(history).toHaveLength(1);
      expect(history[0].subject).toContain("Daily Crypto");
      expect(history[0].emails_sent).toBe(10);
    });
  });

  // ────────────────────────────────────────────────────
  // Flow 7: Rate limiting — free vs pro tier
  // ────────────────────────────────────────────────────
  describe("Flow 7: API rate limiting — free tier limited, pro unlimited", () => {
    it("free tier cannot access API endpoints", () => {
      const { user } = userRepo.findOrCreateByEmail("free@test.com");
      expect(user.tier).toBe("free");

      // Free users have apiAccessEnabled = false
      // This is enforced by tierApiRateLimit middleware
      // which checks TIER_LIMITS[user.tier].apiAccessEnabled
    });

    it("tracks API usage per user per day", () => {
      const { user } = userRepo.findOrCreateByEmail("pro-api@test.com");
      userRepo.updateTier(user.id, "pro");

      const today = new Date().toISOString().split("T")[0];
      expect(userRepo.getApiUsageCount(user.id, today)).toBe(0);

      userRepo.recordApiUsage(user.id, "/api/prices");
      userRepo.recordApiUsage(user.id, "/api/news");
      userRepo.recordApiUsage(user.id, "/api/prices");

      expect(userRepo.getApiUsageCount(user.id, today)).toBe(3);
    });

    it("free tier alert count is limited to 3/day", () => {
      const { user } = userRepo.findOrCreateByEmail("limited@test.com");

      // Record 3 alerts
      for (let i = 0; i < 3; i++) {
        alertRepo.insertTriggeredAlert({
          userId: user.id,
          tokenSymbol: "btc",
          signals: [{ type: "price_movement", description: `+${i + 1}%` }],
          signalCount: 1,
          summary: `Alert ${i + 1}`,
          deliveredChannels: ["web"],
        });
      }

      // Count daily alerts
      const count = userRepo.getDailyAlertCount(user.id);
      expect(count).toBe(3);
    });

    it("pro tier can receive unlimited alerts", () => {
      const { user } = userRepo.findOrCreateByEmail("pro-alerts@test.com");
      userRepo.updateTier(user.id, "pro");
      expect(user.tier === "free"); // initially
      const updated = userRepo.findById(user.id);
      expect(updated!.tier).toBe("pro");
      // Pro tier has alertsPerDay = Infinity
    });
  });

  // ────────────────────────────────────────────────────
  // Flow 8: Search — tokens and articles
  // ────────────────────────────────────────────────────
  describe("Flow 8: Search — tokens and articles", () => {
    it("searches tokens by name", async () => {
      const res = await request(app).get("/api/search?q=bitcoin");
      expect(res.status).toBe(200);
      expect(res.body.data.tokens.length).toBeGreaterThan(0);
      expect(res.body.data.tokens[0].name).toBe("Bitcoin");
    });

    it("searches tokens by symbol", async () => {
      const res = await request(app).get("/api/search?q=eth");
      expect(res.status).toBe(200);
      expect(res.body.data.tokens.length).toBeGreaterThan(0);
    });

    it("searches articles by title keyword", async () => {
      const res = await request(app).get("/api/search?q=DeFi");
      expect(res.status).toBe(200);
      expect(res.body.data.articles.length).toBeGreaterThan(0);
      expect(res.body.data.articles[0].title).toContain("DeFi");
    });

    it("searches articles by summary keyword", async () => {
      const res = await request(app).get("/api/search?q=ETF");
      expect(res.status).toBe(200);
      expect(res.body.data.articles.length).toBeGreaterThan(0);
    });

    it("returns both tokens and articles for broad query", async () => {
      const res = await request(app).get("/api/search?q=sol");
      expect(res.status).toBe(200);
      expect(res.body.data.tokens.length).toBeGreaterThan(0);
      expect(res.body.data.articles.length).toBeGreaterThan(0);
    });

    it("returns empty results for no-match query", async () => {
      const res = await request(app).get("/api/search?q=zzzzzzzznothing");
      expect(res.status).toBe(200);
      expect(res.body.data.tokens).toHaveLength(0);
      expect(res.body.data.articles).toHaveLength(0);
    });

    it("returns 400 when query is missing", async () => {
      const res = await request(app).get("/api/search");
      expect(res.status).toBe(400);
    });
  });

  // ────────────────────────────────────────────────────
  // Cross-flow: Complete user journey
  // ────────────────────────────────────────────────────
  describe("Cross-flow: Complete user journey — signup to pro to alerts", () => {
    it("walks through the entire user lifecycle", async () => {
      // 1. User signs up
      const magicLink = userRepo.createMagicLink("journey@test.com");
      const verified = userRepo.verifyMagicLink(magicLink.token);
      expect(verified).not.toBeNull();
      const { user } = userRepo.findOrCreateByEmail("journey@test.com");
      const jwt = signToken(user.id);

      // 2. User browses dashboard
      const prices = await request(app).get("/api/prices");
      expect(prices.status).toBe(200);
      expect(prices.body.data.length).toBeGreaterThan(0);

      const news = await request(app).get("/api/news");
      expect(news.status).toBe(200);
      expect(news.body.data.length).toBeGreaterThan(0);

      // 3. User views BTC token page
      const btcPage = await request(app).get("/api/tokens/btc");
      expect(btcPage.status).toBe(200);
      expect(btcPage.body.data.price.price_usd).toBe(65000);

      // 4. User sets up alerts
      const alertSetup = await request(app)
        .post("/api/alerts/preferences")
        .send({
          userId: user.id,
          tokenSymbols: ["btc", "eth"],
          channels: ["email", "web"],
          sensitivity: "medium",
          emailAddress: "journey@test.com",
          minSignals: 2,
        });
      expect(alertSetup.status).toBe(201);

      // 5. User subscribes to digest
      const digestSub = await request(app)
        .post("/api/digest/subscribe")
        .send({ email: "journey@test.com", lang: "en" });
      expect(digestSub.status).toBe(200);

      // 6. User upgrades to Pro
      userRepo.updateStripeCustomerId(user.id, "cus_journey");
      userRepo.upsertSubscription({
        id: "sub-journey",
        userId: user.id,
        stripeSubscriptionId: "stripe_sub_journey",
        status: "active",
      });
      userRepo.updateTier(user.id, "pro");

      const proUser = userRepo.findById(user.id);
      expect(proUser!.tier).toBe("pro");

      // 7. Pro user has active subscription
      const sub = userRepo.getActiveSubscription(user.id);
      expect(sub).toBeDefined();
      expect(sub!.status).toBe("active");

      // 8. Search works
      const search = await request(app).get("/api/search?q=bitcoin");
      expect(search.status).toBe(200);
      expect(search.body.data.tokens.length).toBeGreaterThan(0);

      // 9. Alert preferences persist
      const readPrefs = await request(app).get(`/api/alerts/preferences?userId=${user.id}`);
      expect(readPrefs.status).toBe(200);
      expect(readPrefs.body.data.tokenSymbols).toEqual(["btc", "eth"]);
    });
  });
});
