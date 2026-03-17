import { Pool } from "@neondatabase/serverless";
import { getPool } from "./database";

export interface SocialMentionRow {
  id: number;
  token_symbol: string;
  source: string;
  mention_count: number;
  sentiment_score: number;
  sentiment_label: string;
  positive_count: number;
  negative_count: number;
  neutral_count: number;
  sample_texts: string;
  fetched_at: string;
}

export interface SocialMentionInsert {
  tokenSymbol: string;
  source: string;
  mentionCount: number;
  sentimentScore: number;
  sentimentLabel: string;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  sampleTexts: string[];
}

export class SocialRepository {
  private pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || getPool();
  }

  async insertMention(insert: SocialMentionInsert): Promise<number> {
    const { rows } = await this.pool.query(
      `INSERT INTO social_mentions
        (token_symbol, source, mention_count, sentiment_score, sentiment_label,
         positive_count, negative_count, neutral_count, sample_texts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT(token_symbol, source, fetched_at) DO UPDATE SET
         mention_count = EXCLUDED.mention_count,
         sentiment_score = EXCLUDED.sentiment_score,
         sentiment_label = EXCLUDED.sentiment_label,
         positive_count = EXCLUDED.positive_count,
         negative_count = EXCLUDED.negative_count,
         neutral_count = EXCLUDED.neutral_count,
         sample_texts = EXCLUDED.sample_texts
       RETURNING id`,
      [
        insert.tokenSymbol.toUpperCase(),
        insert.source,
        insert.mentionCount,
        insert.sentimentScore,
        insert.sentimentLabel,
        insert.positiveCount,
        insert.negativeCount,
        insert.neutralCount,
        JSON.stringify(insert.sampleTexts),
      ]
    );
    return rows[0].id;
  }

  async insertBatch(inserts: SocialMentionInsert[]): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      let count = 0;
      for (const insert of inserts) {
        await client.query(
          `INSERT INTO social_mentions
            (token_symbol, source, mention_count, sentiment_score, sentiment_label,
             positive_count, negative_count, neutral_count, sample_texts)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT(token_symbol, source, fetched_at) DO UPDATE SET
             mention_count = EXCLUDED.mention_count,
             sentiment_score = EXCLUDED.sentiment_score,
             sentiment_label = EXCLUDED.sentiment_label,
             positive_count = EXCLUDED.positive_count,
             negative_count = EXCLUDED.negative_count,
             neutral_count = EXCLUDED.neutral_count,
             sample_texts = EXCLUDED.sample_texts`,
          [
            insert.tokenSymbol.toUpperCase(),
            insert.source,
            insert.mentionCount,
            insert.sentimentScore,
            insert.sentimentLabel,
            insert.positiveCount,
            insert.negativeCount,
            insert.neutralCount,
            JSON.stringify(insert.sampleTexts),
          ]
        );
        count++;
      }
      await client.query("COMMIT");
      return count;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  /** Get the latest sentiment for a token. */
  async getLatest(tokenSymbol: string, source: string = "twitter"): Promise<SocialMentionRow | undefined> {
    const { rows } = await this.pool.query(
      `SELECT * FROM social_mentions
       WHERE token_symbol = $1 AND source = $2
       ORDER BY fetched_at DESC LIMIT 1`,
      [tokenSymbol.toUpperCase(), source]
    );
    return rows[0];
  }

  /** Get sentiment history for a token within the last N hours. */
  async getHistory(tokenSymbol: string, hours: number = 24, source: string = "twitter"): Promise<SocialMentionRow[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM social_mentions
       WHERE token_symbol = $1 AND source = $2 AND fetched_at >= NOW() - INTERVAL '${hours} hours'
       ORDER BY fetched_at DESC`,
      [tokenSymbol.toUpperCase(), source]
    );
    return rows;
  }

  /** Get latest sentiment for all tracked tokens. */
  async getLatestAll(source: string = "twitter"): Promise<SocialMentionRow[]> {
    const { rows } = await this.pool.query(
      `SELECT s.* FROM social_mentions s
       INNER JOIN (
         SELECT token_symbol, MAX(fetched_at) as max_fetched
         FROM social_mentions WHERE source = $1
         GROUP BY token_symbol
       ) latest ON s.token_symbol = latest.token_symbol AND s.fetched_at = latest.max_fetched
       WHERE s.source = $2
       ORDER BY s.mention_count DESC`,
      [source, source]
    );
    return rows;
  }

  /** Get mention count change between latest and previous data points. */
  async getMentionChange(tokenSymbol: string, source: string = "twitter"): Promise<{ current: number; previous: number; changePercent: number } | null> {
    const { rows } = await this.pool.query(
      `SELECT mention_count, fetched_at FROM social_mentions
       WHERE token_symbol = $1 AND source = $2
       ORDER BY fetched_at DESC LIMIT 2`,
      [tokenSymbol.toUpperCase(), source]
    );

    if (rows.length < 2) return null;
    const [current, previous] = rows;
    if (previous.mention_count === 0) return null;

    return {
      current: current.mention_count,
      previous: previous.mention_count,
      changePercent: ((current.mention_count - previous.mention_count) / previous.mention_count) * 100,
    };
  }
}
