import { describe, it, expect } from "vitest";
import { NewsClassifier } from "./news-classifier.js";

describe("NewsClassifier", () => {
  const classifier = new NewsClassifier(); // No API key = keyword fallback only

  describe("classifyWithKeywords", () => {
    it("should classify ETF news", () => {
      const result = classifier.classifyWithKeywords({
        title: "SEC Approves Spot Bitcoin ETF",
        summary: "The SEC has approved a spot BTC ETF filing.",
      });
      expect(result.category).toBe("etf");
    });

    it("should classify regulatory news", () => {
      const result = classifier.classifyWithKeywords({
        title: "SEC Files Lawsuit Against Crypto Exchange",
        summary: "The regulatory body has taken enforcement action.",
      });
      // "SEC" + "lawsuit" → regulatory. But ETF check comes first, and this doesn't have "etf"
      expect(result.category).toBe("regulatory");
    });

    it("should classify hack/exploit news", () => {
      const result = classifier.classifyWithKeywords({
        title: "DeFi Protocol Suffers $50M Exploit",
        summary: "Hackers drained funds from the protocol.",
      });
      expect(result.category).toBe("hack_exploit");
    });

    it("should classify geopolitical news", () => {
      const result = classifier.classifyWithKeywords({
        title: "New Tariffs Could Impact Crypto Markets",
        summary: "Trade war escalation affects digital assets.",
      });
      expect(result.category).toBe("geopolitical");
    });

    it("should classify institutional news", () => {
      const result = classifier.classifyWithKeywords({
        title: "MicroStrategy Buys Another 5000 BTC",
        summary: "Saylor continues accumulating Bitcoin.",
      });
      expect(result.category).toBe("institutional");
    });

    it("should classify market movement news", () => {
      const result = classifier.classifyWithKeywords({
        title: "Bitcoin Surges Past $100K in Massive Rally",
        summary: "BTC hits new all-time high.",
      });
      expect(result.category).toBe("market");
    });

    it("should classify technology news", () => {
      const result = classifier.classifyWithKeywords({
        title: "Ethereum Completes Major Protocol Upgrade",
        summary: "The mainnet upgrade introduces new features.",
      });
      expect(result.category).toBe("technology");
    });

    it("should classify as other for unmatched content", () => {
      const result = classifier.classifyWithKeywords({
        title: "Crypto Podcast Interviews Industry Leader",
        summary: "A conversation about the future of digital assets.",
      });
      expect(result.category).toBe("other");
    });

    it("should handle null summary", () => {
      const result = classifier.classifyWithKeywords({
        title: "Bitcoin ETF Sees Record Inflows",
        summary: null,
      });
      expect(result.category).toBe("etf");
    });

    it("should return confidence scores", () => {
      const result = classifier.classifyWithKeywords({
        title: "Major Hack Drains Protocol",
        summary: null,
      });
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe("classify (without API key)", () => {
    it("should fall back to keyword classification", async () => {
      const result = await classifier.classify({
        title: "SEC Investigates Crypto Exchange for Compliance Violations",
        summary: "Regulatory enforcement action initiated.",
      });
      expect(result.category).toBe("regulatory");
      expect(result.confidence).toBeGreaterThan(0);
    });
  });
});
