import { describe, it, expect, beforeEach } from "vitest";
import { createTestDatabase } from "./database.js";
import { WhaleRepository } from "./whale-repository.js";
import type Database from "better-sqlite3";

describe("WhaleRepository", () => {
  let db: Database.Database;
  let repo: WhaleRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new WhaleRepository(db);
  });

  it("inserts a whale transaction", () => {
    const changes = repo.insert({
      tokenSymbol: "BTC",
      transactionHash: "0xabc123",
      fromAddress: "0xfrom",
      toAddress: "0xto",
      amount: 100,
      amountUsd: 5_000_000,
      blockchain: "bitcoin",
    });
    expect(changes).toBe(1);

    const recent = repo.getRecent("BTC", 1);
    expect(recent).toHaveLength(1);
    expect(recent[0].token_symbol).toBe("BTC");
    expect(recent[0].amount_usd).toBe(5_000_000);
    expect(recent[0].transaction_hash).toBe("0xabc123");
  });

  it("ignores duplicate transaction hashes", () => {
    const tx = {
      tokenSymbol: "ETH",
      transactionHash: "0xdup",
      amount: 50,
      amountUsd: 2_000_000,
      blockchain: "ethereum",
    };
    repo.insert(tx);
    const changes = repo.insert(tx);
    expect(changes).toBe(0);

    const recent = repo.getRecent("ETH", 1);
    expect(recent).toHaveLength(1);
  });

  it("inserts batch transactions", () => {
    const txs = [
      { tokenSymbol: "BTC", transactionHash: "0x1", amount: 10, amountUsd: 1_000_000, blockchain: "bitcoin" },
      { tokenSymbol: "ETH", transactionHash: "0x2", amount: 500, amountUsd: 2_000_000, blockchain: "ethereum" },
      { tokenSymbol: "BTC", transactionHash: "0x3", amount: 20, amountUsd: 3_000_000, blockchain: "bitcoin" },
    ];
    const count = repo.insertBatch(txs);
    expect(count).toBe(3);
  });

  it("calculates volume USD correctly", () => {
    repo.insertBatch([
      { tokenSymbol: "BTC", transactionHash: "0x1", amount: 10, amountUsd: 1_000_000, blockchain: "bitcoin" },
      { tokenSymbol: "BTC", transactionHash: "0x2", amount: 20, amountUsd: 3_000_000, blockchain: "bitcoin" },
    ]);
    const volume = repo.getVolumeUsd("BTC", 1);
    expect(volume).toBe(4_000_000);
  });

  it("counts transactions correctly", () => {
    repo.insertBatch([
      { tokenSymbol: "ETH", transactionHash: "0x1", amount: 10, amountUsd: 1_000_000, blockchain: "ethereum" },
      { tokenSymbol: "ETH", transactionHash: "0x2", amount: 20, amountUsd: 2_000_000, blockchain: "ethereum" },
    ]);
    expect(repo.getCount("ETH", 1)).toBe(2);
    expect(repo.getCount("BTC", 1)).toBe(0);
  });

  it("returns summary across tokens", () => {
    repo.insertBatch([
      { tokenSymbol: "BTC", transactionHash: "0x1", amount: 10, amountUsd: 5_000_000, blockchain: "bitcoin" },
      { tokenSymbol: "ETH", transactionHash: "0x2", amount: 500, amountUsd: 2_000_000, blockchain: "ethereum" },
      { tokenSymbol: "BTC", transactionHash: "0x3", amount: 20, amountUsd: 3_000_000, blockchain: "bitcoin" },
    ]);
    const summary = repo.getSummary(24);
    expect(summary).toHaveLength(2);
    expect(summary[0].token_symbol).toBe("BTC");
    expect(summary[0].tx_count).toBe(2);
    expect(summary[0].total_usd).toBe(8_000_000);
  });

  it("stores uppercase token symbols", () => {
    repo.insert({
      tokenSymbol: "btc",
      transactionHash: "0xlower",
      amount: 1,
      amountUsd: 100_000,
      blockchain: "bitcoin",
    });
    const recent = repo.getRecent("BTC", 1);
    expect(recent).toHaveLength(1);
    expect(recent[0].token_symbol).toBe("BTC");
  });

  it("returns latest transactions across all tokens", () => {
    repo.insertBatch([
      { tokenSymbol: "BTC", transactionHash: "0x1", amount: 10, amountUsd: 5_000_000, blockchain: "bitcoin" },
      { tokenSymbol: "ETH", transactionHash: "0x2", amount: 500, amountUsd: 2_000_000, blockchain: "ethereum" },
    ]);
    const latest = repo.getLatestAll(10);
    expect(latest).toHaveLength(2);
  });
});
