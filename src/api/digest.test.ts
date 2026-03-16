import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { createTestDatabase } from "../db/database.js";
import { DigestRepository } from "../db/digest-repository.js";
import { createDigestRouter } from "./digest.js";
import type Database from "better-sqlite3";

function createApp() {
  const db = createTestDatabase();
  const digestRepo = new DigestRepository(db);
  const app = express();
  app.use(express.json());
  app.use("/api/digest", createDigestRouter(digestRepo));
  return { app, digestRepo };
}

describe("POST /api/digest/subscribe", () => {
  it("subscribes with email", async () => {
    const { app } = createApp();
    const res = await request(app)
      .post("/api/digest/subscribe")
      .send({ email: "test@example.com", lang: "en" });

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("test@example.com");
    expect(res.body.data.active).toBe(1);
  });

  it("subscribes with telegram_chat_id", async () => {
    const { app } = createApp();
    const res = await request(app)
      .post("/api/digest/subscribe")
      .send({ telegram_chat_id: "123456", lang: "zh" });

    expect(res.status).toBe(200);
    expect(res.body.data.telegram_chat_id).toBe("123456");
    expect(res.body.data.lang).toBe("zh");
  });

  it("returns 400 without email or telegram", async () => {
    const { app } = createApp();
    const res = await request(app)
      .post("/api/digest/subscribe")
      .send({ lang: "en" });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/digest/unsubscribe", () => {
  it("unsubscribes by email", async () => {
    const { app } = createApp();
    await request(app).post("/api/digest/subscribe").send({ email: "test@example.com" });

    const res = await request(app)
      .post("/api/digest/unsubscribe")
      .send({ email: "test@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("GET /api/digest/unsubscribe", () => {
  it("unsubscribes by token", async () => {
    const { app, digestRepo } = createApp();
    const sub = digestRepo.subscribeEmail("test@example.com");

    const res = await request(app)
      .get(`/api/digest/unsubscribe?token=${sub.unsubscribe_token}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain("Unsubscribed");
  });

  it("returns 404 for invalid token", async () => {
    const { app } = createApp();
    const res = await request(app).get("/api/digest/unsubscribe?token=bad-token");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/digest/subscribers", () => {
  it("returns subscriber counts", async () => {
    const { app, digestRepo } = createApp();
    digestRepo.subscribeEmail("a@test.com");
    digestRepo.subscribeEmail("b@test.com");
    digestRepo.unsubscribeEmail("b@test.com");

    const res = await request(app).get("/api/digest/subscribers");
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.active).toBe(1);
  });
});

describe("GET /api/digest/history", () => {
  it("returns empty when no digests", async () => {
    const { app } = createApp();
    const res = await request(app).get("/api/digest/history");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it("returns saved digests", async () => {
    const { app, digestRepo } = createApp();
    digestRepo.saveDigest({
      lang: "en",
      subject: "Test",
      contentHtml: "<p>test</p>",
      contentTelegram: "test",
      emailsSent: 3,
      telegramsSent: 1,
    });

    const res = await request(app).get("/api/digest/history");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].subject).toBe("Test");
  });
});

describe("GET /api/digest/latest", () => {
  it("returns 404 when no digest", async () => {
    const { app } = createApp();
    const res = await request(app).get("/api/digest/latest?lang=en");
    expect(res.status).toBe(404);
  });

  it("returns latest digest for language", async () => {
    const { app, digestRepo } = createApp();
    digestRepo.saveDigest({
      lang: "en",
      subject: "EN Digest",
      contentHtml: "<p>en</p>",
      contentTelegram: "en",
      emailsSent: 1,
      telegramsSent: 0,
    });

    const res = await request(app).get("/api/digest/latest?lang=en");
    expect(res.status).toBe(200);
    expect(res.body.data.subject).toBe("EN Digest");
  });
});
