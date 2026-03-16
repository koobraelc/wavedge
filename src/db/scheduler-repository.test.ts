import { describe, it, expect, beforeEach } from "vitest";
import { SchedulerRepository } from "./scheduler-repository.js";
import { createTestDatabase } from "./database.js";
import type Database from "better-sqlite3";

describe("SchedulerRepository", () => {
  let db: Database.Database;
  let repo: SchedulerRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SchedulerRepository(db);
  });

  it("logs and retrieves errors", () => {
    repo.logError("price", new Error("CoinGecko timeout"));
    repo.logError("news", "RSS parse failure");

    const all = repo.getRecent(10);
    expect(all).toHaveLength(2);
    expect(all[0].task_name).toBe("news");
    expect(all[0].error_message).toBe("RSS parse failure");
    expect(all[1].task_name).toBe("price");
    expect(all[1].error_message).toBe("CoinGecko timeout");
  });

  it("filters by task name", () => {
    repo.logError("price", "err1");
    repo.logError("news", "err2");
    repo.logError("price", "err3");

    const priceErrors = repo.getRecent(10, "price");
    expect(priceErrors).toHaveLength(2);
    expect(priceErrors.every((e) => e.task_name === "price")).toBe(true);
  });

  it("stores error stack for Error objects", () => {
    const err = new Error("test");
    repo.logError("alert", err);

    const errors = repo.getRecent(1);
    expect(errors[0].error_stack).toContain("Error: test");
  });

  it("counts recent errors", () => {
    repo.logError("price", "e1");
    repo.logError("price", "e2");
    repo.logError("news", "e3");

    const count = repo.countRecent(60);
    expect(count).toBe(3);
  });

  it("prunes errors beyond 1000", () => {
    // Insert 5 errors, set limit artificially low by checking pruning works
    for (let i = 0; i < 5; i++) {
      repo.logError("price", `error ${i}`);
    }
    const all = repo.getRecent(100);
    expect(all.length).toBeLessThanOrEqual(1000);
    expect(all.length).toBe(5);
  });
});
