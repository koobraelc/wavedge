import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "wavedge.db");

let db: Database.Database | null = null;

export function getDatabase(dbPath: string = DB_PATH): Database.Database {
  if (db) return db;
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initializeSchema(db);
  return db;
}

export function initializeSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON tokens(symbol);

    CREATE TABLE IF NOT EXISTS prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_id TEXT NOT NULL REFERENCES tokens(id),
      price_usd REAL NOT NULL,
      market_cap REAL,
      total_volume REAL,
      price_change_24h REAL,
      price_change_percentage_24h REAL,
      circulating_supply REAL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(token_id, fetched_at)
    );

    CREATE INDEX IF NOT EXISTS idx_prices_token_id ON prices(token_id);
    CREATE INDEX IF NOT EXISTS idx_prices_fetched_at ON prices(fetched_at);
    CREATE INDEX IF NOT EXISTS idx_prices_token_fetched ON prices(token_id, fetched_at);

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guid TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT,
      url TEXT NOT NULL,
      source TEXT NOT NULL,
      author TEXT,
      published_at TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      relevance_score REAL NOT NULL DEFAULT 0,
      token_tags TEXT NOT NULL DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
    CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
    CREATE INDEX IF NOT EXISTS idx_articles_relevance ON articles(relevance_score);
    CREATE INDEX IF NOT EXISTS idx_articles_guid ON articles(guid);

    CREATE TABLE IF NOT EXISTS news_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL REFERENCES articles(id),
      category TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      classified_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(article_id)
    );

    CREATE INDEX IF NOT EXISTS idx_news_categories_article ON news_categories(article_id);
    CREATE INDEX IF NOT EXISTS idx_news_categories_category ON news_categories(category);

    CREATE TABLE IF NOT EXISTS impact_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL REFERENCES articles(id),
      token_symbol TEXT NOT NULL,
      category TEXT NOT NULL,
      price_at_event REAL,
      price_1h REAL,
      price_4h REAL,
      price_24h REAL,
      change_1h REAL,
      change_4h REAL,
      change_24h REAL,
      sample_size INTEGER NOT NULL DEFAULT 0,
      avg_change_1h REAL,
      avg_change_4h REAL,
      avg_change_24h REAL,
      confidence_score REAL NOT NULL DEFAULT 0,
      computed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(article_id, token_symbol)
    );

    CREATE INDEX IF NOT EXISTS idx_impact_events_article ON impact_events(article_id);
    CREATE INDEX IF NOT EXISTS idx_impact_events_token ON impact_events(token_symbol);
    CREATE INDEX IF NOT EXISTS idx_impact_events_category ON impact_events(category);

    CREATE TABLE IF NOT EXISTS summary_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_symbol TEXT NOT NULL,
      lang TEXT NOT NULL DEFAULT 'en',
      summary_json TEXT NOT NULL,
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      UNIQUE(token_symbol, lang)
    );

    CREATE INDEX IF NOT EXISTS idx_summary_cache_token ON summary_cache(token_symbol);
    CREATE INDEX IF NOT EXISTS idx_summary_cache_expires ON summary_cache(expires_at);
  `);
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/** Create a fresh in-memory database for testing */
export function createTestDatabase(): Database.Database {
  const testDb = new Database(":memory:");
  testDb.pragma("journal_mode = WAL");
  testDb.pragma("foreign_keys = ON");
  initializeSchema(testDb);
  return testDb;
}
