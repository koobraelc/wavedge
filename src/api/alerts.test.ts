import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createTestDatabase } from "../db/database.js";
import { AlertRepository } from "../db/alert-repository.js";
import { PushRepository } from "../db/push-repository.js";
import { createAlertsRouter } from "./alerts.js";

function createApp() {
  const db = createTestDatabase();
  const alertRepo = new AlertRepository(db);
  const pushRepo = new PushRepository(db);
  const app = express();
  app.use(express.json());
  app.use("/api/alerts", createAlertsRouter(alertRepo, pushRepo));
  return { app, alertRepo, pushRepo, db };
}

describe("GET /api/alerts/preferences", () => {
  it("returns null when no preferences exist", async () => {
    const { app } = createApp();
    const res = await request(app).get("/api/alerts/preferences");
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it("returns existing preferences", async () => {
    const { app, alertRepo } = createApp();
    alertRepo.upsertPreferences({
      userId: "default",
      tokenSymbols: ["BTC"],
      sensitivity: "high",
    });

    const res = await request(app).get("/api/alerts/preferences");
    expect(res.status).toBe(200);
    expect(res.body.data.tokenSymbols).toEqual(["BTC"]);
    expect(res.body.data.sensitivity).toBe("high");
    expect(res.body.data.enabled).toBe(true);
  });
});

describe("POST /api/alerts/preferences", () => {
  it("creates preferences with defaults", async () => {
    const { app } = createApp();
    const res = await request(app)
      .post("/api/alerts/preferences")
      .send({ tokenSymbols: ["BTC", "ETH"], channels: ["web"] });

    expect(res.status).toBe(201);
    expect(res.body.data.tokenSymbols).toEqual(["BTC", "ETH"]);
    expect(res.body.data.sensitivity).toBe("medium");
    expect(res.body.data.minSignals).toBe(2);
  });

  it("validates sensitivity", async () => {
    const { app } = createApp();
    const res = await request(app)
      .post("/api/alerts/preferences")
      .send({ sensitivity: "extreme" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid sensitivity");
  });

  it("validates channels", async () => {
    const { app } = createApp();
    const res = await request(app)
      .post("/api/alerts/preferences")
      .send({ channels: ["sms"] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid channel");
  });

  it("validates minSignals range", async () => {
    const { app } = createApp();
    const res = await request(app)
      .post("/api/alerts/preferences")
      .send({ minSignals: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("minSignals");
  });

  it("validates email address", async () => {
    const { app } = createApp();
    const res = await request(app)
      .post("/api/alerts/preferences")
      .send({ emailAddress: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid email");
  });

  it("creates with telegram and email config", async () => {
    const { app } = createApp();
    const res = await request(app)
      .post("/api/alerts/preferences")
      .send({
        channels: ["telegram", "email"],
        telegramChatId: "123456",
        emailAddress: "user@example.com",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.telegramChatId).toBe("123456");
    expect(res.body.data.emailAddress).toBe("user@example.com");
  });
});

describe("PATCH /api/alerts/preferences", () => {
  it("returns 404 when no preferences exist", async () => {
    const { app } = createApp();
    const res = await request(app)
      .patch("/api/alerts/preferences")
      .send({ sensitivity: "high" });

    expect(res.status).toBe(404);
  });

  it("updates existing preferences partially", async () => {
    const { app, alertRepo } = createApp();
    alertRepo.upsertPreferences({
      userId: "default",
      tokenSymbols: ["BTC"],
      channels: ["web"],
    });

    const res = await request(app)
      .patch("/api/alerts/preferences")
      .send({ tokenSymbols: ["BTC", "SOL"], sensitivity: "high" });

    expect(res.status).toBe(200);
    expect(res.body.data.tokenSymbols).toEqual(["BTC", "SOL"]);
    expect(res.body.data.sensitivity).toBe("high");
    expect(res.body.data.channels).toEqual(["web"]); // unchanged
  });

  it("can disable alerts", async () => {
    const { app, alertRepo } = createApp();
    alertRepo.upsertPreferences({ userId: "default" });

    const res = await request(app)
      .patch("/api/alerts/preferences")
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(false);
  });
});

describe("GET /api/alerts/history", () => {
  it("returns empty when no alerts", async () => {
    const { app } = createApp();
    const res = await request(app).get("/api/alerts/history");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  it("returns triggered alerts", async () => {
    const { app, alertRepo } = createApp();
    alertRepo.insertTriggeredAlert({
      userId: "default",
      tokenSymbol: "BTC",
      signals: [{ type: "price_movement", value: 5.5 }],
      signalCount: 2,
      summary: "BTC multi-signal alert",
      deliveredChannels: ["telegram"],
    });

    const res = await request(app).get("/api/alerts/history");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0].tokenSymbol).toBe("BTC");
    expect(res.body.data[0].signalCount).toBe(2);
    expect(res.body.data[0].deliveredChannels).toEqual(["telegram"]);
  });
});

describe("POST /api/alerts/preferences with push channel", () => {
  it("accepts push as a valid channel", async () => {
    const { app } = createApp();
    const res = await request(app)
      .post("/api/alerts/preferences")
      .send({ channels: ["web", "push"] });

    expect(res.status).toBe(201);
    expect(res.body.data.channels).toEqual(["web", "push"]);
  });
});

describe("GET /api/alerts/push/vapid-public-key", () => {
  it("returns 503 when VAPID_PUBLIC_KEY not set", async () => {
    const { app } = createApp();
    delete process.env.VAPID_PUBLIC_KEY;
    const res = await request(app).get("/api/alerts/push/vapid-public-key");
    expect(res.status).toBe(503);
  });

  it("returns public key when configured", async () => {
    const { app } = createApp();
    process.env.VAPID_PUBLIC_KEY = "test-public-key-123";
    const res = await request(app).get("/api/alerts/push/vapid-public-key");
    expect(res.status).toBe(200);
    expect(res.body.data.publicKey).toBe("test-public-key-123");
    delete process.env.VAPID_PUBLIC_KEY;
  });
});

describe("POST /api/alerts/push/subscribe", () => {
  it("saves a push subscription", async () => {
    const { app, db } = createApp();
    const res = await request(app)
      .post("/api/alerts/push/subscribe")
      .send({
        userId: "user1",
        subscription: {
          endpoint: "https://push.example.com/sub/1",
          keys: { p256dh: "test-p256dh", auth: "test-auth" },
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.subscribed).toBe(true);

    // Verify in DB
    const pushRepo = new PushRepository(db);
    expect(pushRepo.hasSubscription("user1")).toBe(true);
  });

  it("rejects invalid subscription objects", async () => {
    const { app } = createApp();
    const res = await request(app)
      .post("/api/alerts/push/subscribe")
      .send({ userId: "user1", subscription: {} });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/alerts/push/unsubscribe", () => {
  it("removes a push subscription", async () => {
    const { app, db } = createApp();
    const pushRepo = new PushRepository(db);
    pushRepo.upsert("user1", "https://push.example.com/sub/1", "k1", "a1");

    const res = await request(app)
      .post("/api/alerts/push/unsubscribe")
      .send({ endpoint: "https://push.example.com/sub/1" });

    expect(res.status).toBe(200);
    expect(res.body.data.unsubscribed).toBe(true);
    expect(pushRepo.hasSubscription("user1")).toBe(false);
  });

  it("requires endpoint", async () => {
    const { app } = createApp();
    const res = await request(app)
      .post("/api/alerts/push/unsubscribe")
      .send({});

    expect(res.status).toBe(400);
  });
});

describe("GET /api/alerts/push/status", () => {
  it("returns false when no subscriptions", async () => {
    const { app } = createApp();
    const res = await request(app).get("/api/alerts/push/status?userId=user1");
    expect(res.status).toBe(200);
    expect(res.body.data.subscribed).toBe(false);
  });

  it("returns true when subscriptions exist", async () => {
    const { app, db } = createApp();
    const pushRepo = new PushRepository(db);
    pushRepo.upsert("default", "https://push.example.com/sub/1", "k1", "a1");

    const res = await request(app).get("/api/alerts/push/status");
    expect(res.status).toBe(200);
    expect(res.body.data.subscribed).toBe(true);
  });
});
