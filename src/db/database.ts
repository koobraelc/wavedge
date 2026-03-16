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
    CREATE INDEX IF NOT EXISTS idx_articles_published_tags ON articles(published_at, token_tags);

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

    -- Alert system tables
    CREATE TABLE IF NOT EXISTS alert_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'default',
      token_symbols TEXT NOT NULL DEFAULT '[]',
      channels TEXT NOT NULL DEFAULT '[]',
      sensitivity TEXT NOT NULL DEFAULT 'medium',
      news_frequency_threshold INTEGER NOT NULL DEFAULT 3,
      news_window_minutes INTEGER NOT NULL DEFAULT 60,
      price_change_threshold REAL NOT NULL DEFAULT 5.0,
      volume_change_threshold REAL NOT NULL DEFAULT 100.0,
      sentiment_change_threshold REAL NOT NULL DEFAULT 30.0,
      whale_transaction_threshold REAL NOT NULL DEFAULT 1000000.0,
      min_signals INTEGER NOT NULL DEFAULT 2,
      enabled INTEGER NOT NULL DEFAULT 1,
      telegram_chat_id TEXT,
      email_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_alert_prefs_user ON alert_preferences(user_id);

    CREATE TABLE IF NOT EXISTS triggered_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL DEFAULT 'default',
      token_symbol TEXT NOT NULL,
      signals TEXT NOT NULL,
      signal_count INTEGER NOT NULL,
      summary TEXT NOT NULL,
      delivered_channels TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_triggered_alerts_user ON triggered_alerts(user_id);
    CREATE INDEX IF NOT EXISTS idx_triggered_alerts_token ON triggered_alerts(token_symbol);
    CREATE INDEX IF NOT EXISTS idx_triggered_alerts_created ON triggered_alerts(created_at);

    -- Missed alerts (for free tier users who exceeded daily limit)
    CREATE TABLE IF NOT EXISTS missed_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      token_symbol TEXT NOT NULL,
      signals TEXT NOT NULL,
      signal_count INTEGER NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_missed_alerts_user ON missed_alerts(user_id);
    CREATE INDEX IF NOT EXISTS idx_missed_alerts_created ON missed_alerts(created_at);
    CREATE INDEX IF NOT EXISTS idx_missed_alerts_user_date ON missed_alerts(user_id, created_at);

    -- Daily digest tables
    CREATE TABLE IF NOT EXISTS digest_subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT,
      telegram_chat_id TEXT,
      lang TEXT NOT NULL DEFAULT 'en',
      active INTEGER NOT NULL DEFAULT 1,
      unsubscribe_token TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_digest_subs_email ON digest_subscribers(email);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_digest_subs_telegram ON digest_subscribers(telegram_chat_id);
    CREATE INDEX IF NOT EXISTS idx_digest_subs_active ON digest_subscribers(active);

    CREATE TABLE IF NOT EXISTS digest_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lang TEXT NOT NULL,
      subject TEXT NOT NULL,
      content_html TEXT NOT NULL,
      content_telegram TEXT NOT NULL,
      emails_sent INTEGER NOT NULL DEFAULT 0,
      telegrams_sent INTEGER NOT NULL DEFAULT 0,
      generated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_digest_history_generated ON digest_history(generated_at);

    -- Auth & billing tables
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      tier TEXT NOT NULL DEFAULT 'free',
      stripe_customer_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_stripe ON users(stripe_customer_id);

    CREATE TABLE IF NOT EXISTS magic_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_magic_links_token ON magic_links(token);
    CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      stripe_subscription_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      plan TEXT NOT NULL DEFAULT 'pro',
      current_period_start TEXT,
      current_period_end TEXT,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);

    CREATE TABLE IF NOT EXISTS api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      endpoint TEXT NOT NULL,
      request_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_api_usage_user_date ON api_usage(user_id, request_date);

    -- Affiliate click tracking
    CREATE TABLE IF NOT EXISTS affiliate_clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_symbol TEXT NOT NULL,
      exchange TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_token ON affiliate_clicks(token_symbol);
    CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_exchange ON affiliate_clicks(exchange);

    -- Web push subscriptions
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subs_endpoint ON push_subscriptions(endpoint);

    -- API keys for Pro users
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Default',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      revoked_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

    -- Social sentiment tracking
    CREATE TABLE IF NOT EXISTS social_mentions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_symbol TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'twitter',
      mention_count INTEGER NOT NULL DEFAULT 0,
      sentiment_score REAL NOT NULL DEFAULT 0,
      sentiment_label TEXT NOT NULL DEFAULT 'neutral',
      positive_count INTEGER NOT NULL DEFAULT 0,
      negative_count INTEGER NOT NULL DEFAULT 0,
      neutral_count INTEGER NOT NULL DEFAULT 0,
      sample_texts TEXT NOT NULL DEFAULT '[]',
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(token_symbol, source, fetched_at)
    );

    CREATE INDEX IF NOT EXISTS idx_social_mentions_token ON social_mentions(token_symbol);
    CREATE INDEX IF NOT EXISTS idx_social_mentions_fetched ON social_mentions(fetched_at);
    CREATE INDEX IF NOT EXISTS idx_social_mentions_token_fetched ON social_mentions(token_symbol, fetched_at);
    CREATE INDEX IF NOT EXISTS idx_social_mentions_source_token_fetched ON social_mentions(source, token_symbol, fetched_at);

    -- Whale transaction tracking
    CREATE TABLE IF NOT EXISTS whale_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_symbol TEXT NOT NULL,
      transaction_hash TEXT NOT NULL UNIQUE,
      from_address TEXT,
      to_address TEXT,
      amount REAL NOT NULL,
      amount_usd REAL NOT NULL,
      blockchain TEXT NOT NULL DEFAULT 'unknown',
      transaction_type TEXT NOT NULL DEFAULT 'transfer',
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_whale_tx_token ON whale_transactions(token_symbol);
    CREATE INDEX IF NOT EXISTS idx_whale_tx_fetched ON whale_transactions(fetched_at);
    CREATE INDEX IF NOT EXISTS idx_whale_tx_token_fetched ON whale_transactions(token_symbol, fetched_at);
    CREATE INDEX IF NOT EXISTS idx_whale_tx_hash ON whale_transactions(transaction_hash);

    -- Scheduler error logging
    CREATE TABLE IF NOT EXISTS scheduler_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_name TEXT NOT NULL,
      error_message TEXT NOT NULL,
      error_stack TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_scheduler_errors_task ON scheduler_errors(task_name);
    CREATE INDEX IF NOT EXISTS idx_scheduler_errors_created ON scheduler_errors(created_at);
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
