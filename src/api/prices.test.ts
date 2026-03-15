import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createTestDatabase } from "../db/database.js";
import { PriceRepository } from "../db/price-repository.js";
import { createPricesRouter } from "./prices.js";

function createApp() {
  const db = createTestDatabase();
  const repo = new PriceRepository(db);
  const app = express();
  app.use(express.json());
  app.use("/api/prices", createPricesRouter(repo));
  return { app, repo };
}

const btcInsert = {
  tokenId: "bitcoin", symbol: "btc", name: "Bitcoin",
  priceUsd: 60000, marketCap: 1e12, totalVolume: 3e10,
  priceChange24h: 500, priceChangePercentage24h: 0.84, circulatingSupply: 19e6,
};

const ethInsert = {
  tokenId: "ethereum", symbol: "eth", name: "Ethereum",
  priceUsd: 3000, marketCap: 3.5e11, totalVolume: 1.5e10,
  priceChange24h: 30, priceChangePercentage24h: 1.01, circulatingSupply: 120e6,
};

describe("GET /api/prices", () => {
  it("returns empty array when no data", async () => {
    const { app } = createApp();
    const res = await request(app).get("/api/prices");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  it("returns latest prices sorted by market cap desc", async () => {
    const { app, repo } = createApp();
    repo.insertPrice(btcInsert);
    repo.insertPrice(ethInsert);
    const res = await request(app).get("/api/prices");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.data[0].symbol).toBe("btc");
    expect(res.body.data[1].symbol).toBe("eth");
  });

  it("filters by symbol", async () => {
    const { app, repo } = createApp();
    repo.insertPrice(btcInsert);
    repo.insertPrice(ethInsert);
    const res = await request(app).get("/api/prices?symbol=eth");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0].symbol).toBe("eth");
  });

  it("filters by multiple symbols", async () => {
    const { app, repo } = createApp();
    repo.insertPrice(btcInsert);
    repo.insertPrice(ethInsert);
    const res = await request(app).get("/api/prices?symbol=btc,eth");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  it("sorts by price ascending", async () => {
    const { app, repo } = createApp();
    repo.insertPrice(btcInsert);
    repo.insertPrice(ethInsert);
    const res = await request(app).get("/api/prices?sort=price&order=asc");
    expect(res.status).toBe(200);
    expect(res.body.data[0].symbol).toBe("eth");
    expect(res.body.data[1].symbol).toBe("btc");
  });

  it("sorts by change descending", async () => {
    const { app, repo } = createApp();
    repo.insertPrice(btcInsert);
    repo.insertPrice(ethInsert);
    const res = await request(app).get("/api/prices?sort=change&order=desc");
    expect(res.status).toBe(200);
    expect(res.body.data[0].symbol).toBe("eth"); // 1.01% > 0.84%
  });
});

describe("GET /api/prices/:symbol/history", () => {
  it("returns 404 for unknown symbol", async () => {
    const { app } = createApp();
    const res = await request(app).get("/api/prices/xyz/history");
    expect(res.status).toBe(404);
  });

  it("returns price history for known token by symbol", async () => {
    const { app, repo } = createApp();
    repo.insertPrice(btcInsert);
    const res = await request(app).get("/api/prices/btc/history");
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data[0].price_usd).toBe(60000);
  });
});
