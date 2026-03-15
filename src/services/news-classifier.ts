import Anthropic from "@anthropic-ai/sdk";

export const NEWS_CATEGORIES = [
  "regulatory",
  "etf",
  "geopolitical",
  "institutional",
  "market",
  "hack_exploit",
  "technology",
  "other",
] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export interface ClassificationResult {
  category: NewsCategory;
  confidence: number; // 0-1
}

export interface ClassifyInput {
  title: string;
  summary: string | null;
}

/**
 * Classify news articles into categories using Claude API.
 * Falls back to keyword-based classification if the API is unavailable.
 */
export class NewsClassifier {
  private client: Anthropic | null = null;

  constructor(apiKey?: string) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (key) {
      this.client = new Anthropic({ apiKey: key });
    }
  }

  async classify(input: ClassifyInput): Promise<ClassificationResult> {
    if (this.client) {
      try {
        return await this.classifyWithLLM(input);
      } catch (error) {
        console.warn(
          "LLM classification failed, falling back to keyword classifier:",
          error instanceof Error ? error.message : error
        );
      }
    }
    return this.classifyWithKeywords(input);
  }

  async classifyBatch(
    inputs: ClassifyInput[]
  ): Promise<ClassificationResult[]> {
    return Promise.all(inputs.map((input) => this.classify(input)));
  }

  private async classifyWithLLM(
    input: ClassifyInput
  ): Promise<ClassificationResult> {
    const text = `Title: ${input.title}${input.summary ? `\nSummary: ${input.summary}` : ""}`;

    const response = await this.client!.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: `Classify this crypto news article into exactly ONE category. Respond with JSON only: {"category": "<category>", "confidence": <0.0-1.0>}

Categories:
- regulatory: Government regulation, SEC, legal actions, bans, compliance
- etf: ETF approvals, filings, launches, flows
- geopolitical: War, tariffs, sanctions, international politics affecting crypto
- institutional: Whale activity, fund investments, corporate adoption, MicroStrategy
- market: Price movements, ATH, rallies, crashes, trading volume
- hack_exploit: Hacks, exploits, security breaches, vulnerabilities
- technology: Protocol upgrades, forks, layer 2, technical developments
- other: Doesn't fit above categories

Article:
${text}`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type");
    }

    const parsed = JSON.parse(content.text);
    const category = NEWS_CATEGORIES.includes(parsed.category)
      ? (parsed.category as NewsCategory)
      : "other";
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));

    return { category, confidence };
  }

  /** Keyword-based fallback classifier (derived from backtest script) */
  classifyWithKeywords(input: ClassifyInput): ClassificationResult {
    const text = `${input.title} ${input.summary || ""}`.toLowerCase();

    // Order matters — more specific patterns first
    if (
      /\betf\b/.test(text)
    ) {
      return { category: "etf", confidence: 0.7 };
    }

    if (
      /\b(sec|regulation|regulatory|congress|senate|government|ban|legal|lawsuit|enforcement|compliance|law|bill)\b/.test(
        text
      )
    ) {
      return { category: "regulatory", confidence: 0.65 };
    }

    if (
      /\b(hack|exploit|breach|vulnerability|attack|stolen|drain)\b/.test(text)
    ) {
      return { category: "hack_exploit", confidence: 0.7 };
    }

    if (
      /\b(war|tariff|sanction|geopolit|iran|russia|china.*ban)\b/.test(text)
    ) {
      return { category: "geopolitical", confidence: 0.6 };
    }

    if (
      /\b(whale|saylor|microstrategy|institutional|fund|accumulate|morgan stanley|blackrock|fidelity)\b/.test(
        text
      )
    ) {
      return { category: "institutional", confidence: 0.6 };
    }

    if (
      /\b(ath|all-time|rally|surge|pump|dump|crash|dip|bull|bear|rebound|outperform|plunge|soar)\b/.test(
        text
      )
    ) {
      return { category: "market", confidence: 0.6 };
    }

    if (
      /\b(upgrade|fork|protocol|layer.?2|mainnet|testnet|merge|node|validator)\b/.test(
        text
      )
    ) {
      return { category: "technology", confidence: 0.55 };
    }

    return { category: "other", confidence: 0.3 };
  }
}
