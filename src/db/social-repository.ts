import type Database from "better-sqlite3";
import { getDatabase } from "./database.js";

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
  private db: Database.Database;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  insertMention(insert: SocialMentionInsert): number {
    const result = this.db
      .prepare(
        `INSERT OR REPLACE INTO social_mentions
          (token_symbol, source, mention_count, sentiment_score, sentiment_label,
           positive_count, negative_count, neutral_count, sample_texts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        insert.tokenSymbol.toUpperCase(),
        insert.source,
        insert.mentionCount,
        insert.sentimentScore,
        insert.sentimentLabel,
        insert.positiveCount,
        insert.negativeCount,
        insert.neutralCount,
        JSON.stringify(insert.sampleTexts)
      );
    return result.lastInsertRowid as number;
  }

  insertBatch(inserts: SocialMentionInsert[]): number {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO social_mentions
        (token_symbol, source, mention_count, sentiment_score, sentiment_label,
         positive_count, negative_count, neutral_count, sample_texts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    let count = 0;
    const tx = this.db.transaction(() => {
      for (const insert of inserts) {
        stmt.run(
          insert.tokenSymbol.toUpperCase(),
          insert.source,
          insert.mentionCount,
          insert.sentimentScore,
          insert.sentimentLabel,
          insert.positiveCount,
          insert.negativeCount,
          insert.neutralCount,
          JSON.stringify(insert.sampleTexts)
        );
        count++;
      }
    });
    tx();
    return count;
  }

  /** Get the latest sentiment for a token. */
  getLatest(tokenSymbol: string, source: string = "twitter"): SocialMentionRow | undefined {
    return this.db
      .prepare(
        `SELECT * FROM social_mentions
         WHERE token_symbol = ? AND source = ?
         ORDER BY fetched_at DESC LIMIT 1`
      )
      .get(tokenSymbol.toUpperCase(), source) as SocialMentionRow | undefined;
  }

  /** Get sentiment history for a token within the last N hours. */
  getHistory(tokenSymbol: string, hours: number = 24, source: string = "twitter"): SocialMentionRow[] {
    return this.db
      .prepare(
        `SELECT * FROM social_mentions
         WHERE token_symbol = ? AND source = ? AND fetched_at >= datetime('now', ?)
         ORDER BY fetched_at DESC`
      )
      .all(tokenSymbol.toUpperCase(), source, `-${hours} hours`) as SocialMentionRow[];
  }

  /** Get latest sentiment for all tracked tokens. */
  getLatestAll(source: string = "twitter"): SocialMentionRow[] {
    return this.db
      .prepare(
        `SELECT s.* FROM social_mentions s
         INNER JOIN (
           SELECT token_symbol, MAX(fetched_at) as max_fetched
           FROM social_mentions WHERE source = ?
           GROUP BY token_symbol
         ) latest ON s.token_symbol = latest.token_symbol AND s.fetched_at = latest.max_fetched
         WHERE s.source = ?
         ORDER BY s.mention_count DESC`
      )
      .all(source, source) as SocialMentionRow[];
  }

  /** Get mention count change between latest and previous data points. */
  getMentionChange(tokenSymbol: string, source: string = "twitter"): { current: number; previous: number; changePercent: number } | null {
    const rows = this.db
      .prepare(
        `SELECT mention_count, fetched_at FROM social_mentions
         WHERE token_symbol = ? AND source = ?
         ORDER BY fetched_at DESC LIMIT 2`
      )
      .all(tokenSymbol.toUpperCase(), source) as { mention_count: number; fetched_at: string }[];

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
