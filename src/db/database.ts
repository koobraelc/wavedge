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
