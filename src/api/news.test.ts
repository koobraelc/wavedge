import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createTestDatabase } from "../db/database.js";
import { NewsRepository } from "../db/news-repository.js";
import { createNewsRouter } from "./news.js";

function createApp() {
  const db = createTestDatabase();
  const repo = new NewsRepository(db);
  const app = express();
  app.use(express.json());
  app.use("/api/news", createNewsRouter(repo));
  return { app, repo };
}

const sampleArticle = {
  guid: "https://example.com/article-1",
  title: "Bitcoin hits new high",
  summary: "BTC surged past $70k today",
  url: "https://example.com/article-1",
  source: "CoinDesk",
  author: "Alice",
  publishedAt: "2026-03-15T10:00:00Z",
  relevanceScore: 0.9,
  tokenTags: ["BTC"],
};

describe("GET /api/news", () => {
  it("returns empty array when no articles", async () => {
    const { app } = createApp();
    const res = await request(app).get("/api/news");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  it("returns articles with pagination", async () => {
    const { app, repo } = createApp();
    repo.insertArticle(sampleArticle);
    repo.insertArticle({ ...sampleArticle, guid: "art-2", title: "ETH update", url: "https://example.com/2" });

    const res = await request(app).get("/api/news?limit=1&offset=0");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.limit).toBe(1);
    expect(res.body.offset).toBe(0);
  });

  it("filters by source", async () => {
    const { app, repo } = createApp();
    repo.insertArticle(sampleArticle);
    repo.insertArticle({ ...sampleArticle, guid: "art-2", source: "CoinTelegraph", url: "https://example.com/2" });

    const res = await request(app).get("/api/news?source=CoinDesk");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0].source).toBe("CoinDesk");
  });

  it("filters by token tag", async () => {
    const { app, repo } = createApp();
    repo.insertArticle(sampleArticle);
    repo.insertArticle({ ...sampleArticle, guid: "art-2", tokenTags: ["ETH"], url: "https://example.com/2" });

    const res = await request(app).get("/api/news?token=ETH");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });
});

describe("GET /api/news/sources", () => {
  it("returns distinct sources", async () => {
    const { app, repo } = createApp();
    repo.insertArticle(sampleArticle);
    repo.insertArticle({ ...sampleArticle, guid: "art-2", source: "Decrypt", url: "https://example.com/2" });

    const res = await request(app).get("/api/news/sources");
    expect(res.status).toBe(200);
    expect(res.body.data).toContain("CoinDesk");
    expect(res.body.data).toContain("Decrypt");
  });
});
