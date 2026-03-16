import { describe, it, expect, vi, afterEach } from "vitest";
import { ResponseCache } from "./response-cache.js";

describe("ResponseCache", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns undefined for missing key", () => {
    const cache = new ResponseCache();
    expect(cache.get("missing")).toBeUndefined();
  });

  it("stores and retrieves values", () => {
    const cache = new ResponseCache();
    cache.set("key1", { hello: "world" }, 60);
    expect(cache.get("key1")).toEqual({ hello: "world" });
  });

  it("expires entries after TTL", () => {
    const cache = new ResponseCache();
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(1000) // set time
      .mockReturnValueOnce(62000); // get time (61s later)
    cache.set("key1", "data", 60);
    expect(cache.get("key1")).toBeUndefined();
  });

  it("invalidates by exact key", () => {
    const cache = new ResponseCache();
    cache.set("key1", "data", 60);
    cache.invalidate("key1");
    expect(cache.get("key1")).toBeUndefined();
  });

  it("invalidates by prefix", () => {
    const cache = new ResponseCache();
    cache.set("/api/tokens/btc", "a", 60);
    cache.set("/api/tokens/btc/impact", "b", 60);
    cache.set("/api/prices", "c", 60);
    cache.invalidate("/api/tokens/btc");
    expect(cache.get("/api/tokens/btc/impact")).toBeUndefined();
    expect(cache.get("/api/prices")).toEqual("c");
  });

  it("clears all entries", () => {
    const cache = new ResponseCache();
    cache.set("a", 1, 60);
    cache.set("b", 2, 60);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
