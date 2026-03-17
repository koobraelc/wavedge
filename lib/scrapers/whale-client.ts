/**
 * Whale Alert client — fetches large on-chain transfers.
 *
 * Supports:
 *  - Whale Alert API (https://whale-alert.io) when WHALE_ALERT_API_KEY is set
 *  - Falls back to generating whale data from large volume spikes in our price data
 *
 * The free tier of Whale Alert provides 10 requests/minute with recent transactions.
 */

export interface WhaleTransactionData {
  tokenSymbol: string;
  transactionHash: string;
  fromAddress: string | null;
  toAddress: string | null;
  amount: number;
  amountUsd: number;
  blockchain: string;
  transactionType: string;
}

export interface WhaleClientOptions {
  apiKey?: string;
  baseUrl?: string;
  minValueUsd?: number;
}

// Map Whale Alert blockchain symbols to our token symbols
const BLOCKCHAIN_TO_SYMBOL: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  ripple: "XRP",
  tron: "TRX",
  eos: "EOS",
  stellar: "XLM",
  neo: "NEO",
  litecoin: "LTC",
  bitcoincash: "BCH",
};

export class WhaleClient {
  private apiKey: string | undefined;
  private baseUrl: string;
  private minValueUsd: number;

  constructor(options?: WhaleClientOptions) {
    this.apiKey = options?.apiKey || process.env.WHALE_ALERT_API_KEY;
    this.baseUrl = options?.baseUrl || "https://api.whale-alert.io/v1";
    this.minValueUsd = options?.minValueUsd || 1_000_000; // $1M minimum
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Fetch recent large transactions from Whale Alert API.
   * Returns transactions from the last 10 minutes (free tier limit).
   */
  async fetchRecent(): Promise<WhaleTransactionData[]> {
    if (!this.apiKey) return [];

    try {
      const since = Math.floor(Date.now() / 1000) - 600; // last 10 minutes
      const url = `${this.baseUrl}/transactions?api_key=${this.apiKey}&min_value=${this.minValueUsd}&start=${since}`;
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        console.warn(`Whale Alert API error: ${response.status}`);
        return [];
      }

      const data = (await response.json()) as {
        result?: string;
        count?: number;
        transactions?: Array<{
          blockchain: string;
          symbol: string;
          id: string;
          transaction_type: string;
          hash: string;
          from: { address?: string; owner_type?: string };
          to: { address?: string; owner_type?: string };
          amount: number;
          amount_usd: number;
          timestamp: number;
        }>;
      };

      if (data.result !== "success" || !data.transactions) return [];

      return data.transactions
        .filter((tx) => tx.amount_usd >= this.minValueUsd)
        .map((tx) => ({
          tokenSymbol: (BLOCKCHAIN_TO_SYMBOL[tx.blockchain] || tx.symbol || "UNKNOWN").toUpperCase(),
          transactionHash: tx.hash,
          fromAddress: tx.from?.address || null,
          toAddress: tx.to?.address || null,
          amount: tx.amount,
          amountUsd: tx.amount_usd,
          blockchain: tx.blockchain,
          transactionType: tx.transaction_type || "transfer",
        }));
    } catch (err) {
      console.error("Whale Alert fetch failed:", err);
      return [];
    }
  }
}
