import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CoinGeckoClient } from "./coingecko-client.js";

describe("CoinGeckoClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should construct URL with correct parameters", async () => {
    const mockResponse = { ok: true, json: () => Promise.resolve([]) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    const client = new CoinGeckoClient({ rateLimitMs: 0 });
    await client.getMarketData("usd", 50, 2);

    expect(fetch).toHaveBeenCalledTimes(1);
    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain("vs_currency=usd");
    expect(calledUrl).toContain("per_page=50");
    expect(calledUrl).toContain("page=2");
    expect(calledUrl).toContain("order=market_cap_desc");
  });

  it("should include API key header when provided", async () => {
    const mockResponse = { ok: true, json: () => Promise.resolve([]) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    const client = new CoinGeckoClient({ apiKey: "test-key", rateLimitMs: 0 });
    await client.getMarketData();

    const calledOptions = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect((calledOptions.headers as Record<string, string>)["x-cg-demo-api-key"]).toBe("test-key");
  });

  it("should throw on non-retryable error after retries", async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      headers: new Headers(),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    const client = new CoinGeckoClient({ rateLimitMs: 0 });

    await expect(client.getMarketData()).rejects.toThrow("CoinGecko API error: 500");
  });

  it("should retry on 429 rate limit", async () => {
    const rateLimitResponse = {
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      headers: new Headers({ "retry-after": "1" }),
    };
    const successResponse = { ok: true, json: () => Promise.resolve([{ id: "bitcoin" }]) };

    vi.mocked(fetch)
      .mockResolvedValueOnce(rateLimitResponse as Response)
      .mockResolvedValueOnce(successResponse as Response);

    const client = new CoinGeckoClient({ rateLimitMs: 0 });
    const result = await client.getMarketData();

    expect(result).toEqual([{ id: "bitcoin" }]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
