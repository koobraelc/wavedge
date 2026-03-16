import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildTokenConfig, getTokenConfig, resetTokenConfig, setTokenConfig } from "./token-config.js";
import { createTestDatabase } from "../db/database.js";

describe("buildTokenConfig", () => {
  it("should generate safe keywords from token name", () => {
    const config = buildTokenConfig([
      { symbol: "btc", name: "Bitcoin" },
    ]);

    expect(config.btc.safe).toContain("bitcoin");
  });

  it("should put short symbols (≤3 chars) in uppercaseOnly", () => {
    const config = buildTokenConfig([
      { symbol: "SOL", name: "Solana" },
      { symbol: "ADA", name: "Cardano" },
      { symbol: "OP", name: "Optimism" },
    ]);

    expect(config.sol.uppercaseOnly).toContain("SOL");
    expect(config.sol.safe).toContain("solana");
    expect(config.sol.safe).not.toContain("sol");

    expect(config.ada.uppercaseOnly).toContain("ADA");
    expect(config.ada.safe).toContain("cardano");

    expect(config.op.uppercaseOnly).toContain("OP");
    expect(config.op.safe).toContain("optimism");
  });

  it("should put long symbols (≥4 chars) in safe keywords", () => {
    const config = buildTokenConfig([
      { symbol: "DOGE", name: "Dogecoin" },
      { symbol: "AVAX", name: "Avalanche" },
      { symbol: "MATIC", name: "Polygon" },
    ]);

    expect(config.doge.safe).toContain("doge");
    expect(config.doge.safe).toContain("dogecoin");
    expect(config.doge.uppercaseOnly).toBeUndefined();

    expect(config.avax.safe).toContain("avax");
    expect(config.avax.safe).toContain("avalanche");

    expect(config.matic.safe).toContain("matic");
    expect(config.matic.safe).toContain("polygon");
  });

  it("should avoid short symbol collisions like AI, OP, ONE", () => {
    const config = buildTokenConfig([
      { symbol: "AI", name: "SomeAIToken" },
      { symbol: "OP", name: "Optimism" },
      { symbol: "ONE", name: "Harmony" },
    ]);

    // All ≤3 chars → uppercaseOnly, not safe
    expect(config.ai.uppercaseOnly).toContain("AI");
    expect(config.ai.safe).not.toContain("ai");

    expect(config.op.uppercaseOnly).toContain("OP");
    expect(config.op.safe).not.toContain("op");

    expect(config.one.uppercaseOnly).toContain("ONE");
    expect(config.one.safe).not.toContain("one");
  });

  it("should handle tokens where name equals symbol", () => {
    const config = buildTokenConfig([
      { symbol: "SUI", name: "Sui" },
    ]);

    // name lowered == symbol lowered → name not added to safe (no dup)
    // symbol ≤3 → uppercaseOnly
    expect(config.sui.uppercaseOnly).toContain("SUI");
    expect(config.sui.safe).toEqual([]);
  });

  it("should lowercase everything consistently", () => {
    const config = buildTokenConfig([
      { symbol: "BTC", name: "Bitcoin" },
      { symbol: "ETH", name: "Ethereum" },
    ]);

    expect(config).toHaveProperty("btc");
    expect(config).toHaveProperty("eth");
    expect(config.btc.safe).toContain("bitcoin");
    expect(config.eth.safe).toContain("ethereum");
  });

  it("should handle large token lists", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      symbol: `TK${String(i).padStart(3, "0")}`,
      name: `Token${i}`,
    }));

    const config = buildTokenConfig(rows);
    expect(Object.keys(config)).toHaveLength(100);
  });
});

describe("getTokenConfig with DB", () => {
  beforeEach(() => {
    resetTokenConfig();
  });

  afterEach(() => {
    resetTokenConfig();
  });

  it("should load config from tokens table", () => {
    const db = createTestDatabase();
    db.prepare("INSERT INTO tokens (id, symbol, name) VALUES (?, ?, ?)").run("bitcoin", "btc", "Bitcoin");
    db.prepare("INSERT INTO tokens (id, symbol, name) VALUES (?, ?, ?)").run("ethereum", "eth", "Ethereum");
    db.prepare("INSERT INTO tokens (id, symbol, name) VALUES (?, ?, ?)").run("solana", "sol", "Solana");

    const config = getTokenConfig(db);

    expect(config).toHaveProperty("btc");
    expect(config).toHaveProperty("eth");
    expect(config).toHaveProperty("sol");
    expect(config.btc.safe).toContain("bitcoin");
    expect(config.sol.uppercaseOnly).toContain("SOL");
  });

  it("should cache config after first load", () => {
    const db = createTestDatabase();
    db.prepare("INSERT INTO tokens (id, symbol, name) VALUES (?, ?, ?)").run("bitcoin", "btc", "Bitcoin");

    const config1 = getTokenConfig(db);
    // Insert more tokens — should NOT appear due to cache
    db.prepare("INSERT INTO tokens (id, symbol, name) VALUES (?, ?, ?)").run("ethereum", "eth", "Ethereum");
    const config2 = getTokenConfig(db);

    expect(config1).toBe(config2); // same reference
    expect(config2).not.toHaveProperty("eth");
  });

  it("should reload after resetTokenConfig", () => {
    const db = createTestDatabase();
    db.prepare("INSERT INTO tokens (id, symbol, name) VALUES (?, ?, ?)").run("bitcoin", "btc", "Bitcoin");

    const config1 = getTokenConfig(db);
    expect(Object.keys(config1)).toHaveLength(1);

    db.prepare("INSERT INTO tokens (id, symbol, name) VALUES (?, ?, ?)").run("ethereum", "eth", "Ethereum");
    resetTokenConfig();
    const config2 = getTokenConfig(db);

    expect(Object.keys(config2)).toHaveLength(2);
    expect(config2).toHaveProperty("eth");
  });

  it("should return empty config for empty tokens table", () => {
    const db = createTestDatabase();
    const config = getTokenConfig(db);
    expect(Object.keys(config)).toHaveLength(0);
  });
});

describe("setTokenConfig", () => {
  afterEach(() => {
    resetTokenConfig();
  });

  it("should override cached config for testing", () => {
    setTokenConfig({
      btc: { safe: ["bitcoin"] },
    });

    const config = getTokenConfig();
    expect(config).toHaveProperty("btc");
    expect(Object.keys(config)).toHaveLength(1);
  });
});
