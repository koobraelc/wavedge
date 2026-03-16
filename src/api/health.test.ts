import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../app.js";

describe("GET /health", () => {
  it("returns status with db info and timestamps", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(["ok", "degraded"]).toContain(res.body.status);
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.version).toBeDefined();
    expect(res.body.uptime).toBeTypeOf("number");
    expect(res.body.db).toBeDefined();
    expect(res.body.db.status).toBe("ok");
    expect(res.body.db.counts).toBeDefined();
    expect(res.body.schedulers).toBeDefined();
  });

  it("includes lastPriceFetch and lastNewsFetch fields", async () => {
    const res = await request(app).get("/health");
    expect(res.body).toHaveProperty("lastPriceFetch");
    expect(res.body).toHaveProperty("lastNewsFetch");
    expect(res.body).toHaveProperty("lastAlertCheck");
    expect(res.body).toHaveProperty("lastDigest");
  });
});

describe("GET /api/health/freshness", () => {
  it("returns stale data status", async () => {
    const res = await request(app).get("/api/health/freshness");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("stale");
    expect(res.body).toHaveProperty("lastPriceFetch");
    expect(res.body).toHaveProperty("ageMinutes");
  });
});
