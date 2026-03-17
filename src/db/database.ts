import { Pool, type PoolClient } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://localhost:5432/wavedge";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
  return pool;
}

export async function initializeSchema(p?: Pool): Promise<void> {
  const db = p || getPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON tokens(symbol);

    CREATE TABLE IF NOT EXISTS prices (
      id SERIAL PRIMARY KEY,
      token_id TEXT NOT NULL REFERENCES tokens(id),
      price_usd DOUBLE PRECISION NOT NULL,
      market_cap DOUBLE PRECISION,
      total_volume DOUBLE PRECISION,
      price_change_24h DOUBLE PRECISION,
      price_change_percentage_24h DOUBLE PRECISION,
      circulating_supply DOUBLE PRECISION,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(token_id, fetched_at)
    );

    CREATE INDEX IF NOT EXISTS idx_prices_token_id ON prices(token_id);
    CREATE INDEX IF NOT EXISTS idx_prices_fetched_at ON prices(fetched_at);
    CREATE INDEX IF NOT EXISTS idx_prices_token_fetched ON prices(token_id, fetched_at);

    CREATE TABLE IF NOT EXISTS articles (
      id SERIAL PRIMARY KEY,
      guid TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT,
      url TEXT NOT NULL,
      source TEXT NOT NULL,
      author TEXT,
      published_at TIMESTAMPTZ NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      relevance_score DOUBLE PRECISION NOT NULL DEFAULT 0,
      token_tags TEXT NOT NULL DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
    CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
    CREATE INDEX IF NOT EXISTS idx_articles_relevance ON articles(relevance_score);
    CREATE INDEX IF NOT EXISTS idx_articles_guid ON articles(guid);

    CREATE TABLE IF NOT EXISTS news_categories (
      id SERIAL PRIMARY KEY,
      article_id INTEGER NOT NULL REFERENCES articles(id),
      category TEXT NOT NULL,
      confidence DOUBLE PRECISION NOT NULL DEFAULT 0,
      classified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(article_id)
    );

    CREATE INDEX IF NOT EXISTS idx_news_categories_article ON news_categories(article_id);
    CREATE INDEX IF NOT EXISTS idx_news_categories_category ON news_categories(category);

    CREATE TABLE IF NOT EXISTS impact_events (
      id SERIAL PRIMARY KEY,
      article_id INTEGER NOT NULL REFERENCES articles(id),
      token_symbol TEXT NOT NULL,
      category TEXT NOT NULL,
      price_at_event DOUBLE PRECISION,
      price_1h DOUBLE PRECISION,
      price_4h DOUBLE PRECISION,
      price_24h DOUBLE PRECISION,
      change_1h DOUBLE PRECISION,
      change_4h DOUBLE PRECISION,
      change_24h DOUBLE PRECISION,
      sample_size INTEGER NOT NULL DEFAULT 0,
      avg_change_1h DOUBLE PRECISION,
      avg_change_4h DOUBLE PRECISION,
      avg_change_24h DOUBLE PRECISION,
      confidence_score DOUBLE PRECISION NOT NULL DEFAULT 0,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(article_id, token_symbol)
    );

    CREATE INDEX IF NOT EXISTS idx_impact_events_article ON impact_events(article_id);
    CREATE INDEX IF NOT EXISTS idx_impact_events_token ON impact_events(token_symbol);
    CREATE INDEX IF NOT EXISTS idx_impact_events_category ON impact_events(category);

    CREATE TABLE IF NOT EXISTS summary_cache (
      id SERIAL PRIMARY KEY,
      token_symbol TEXT NOT NULL,
      lang TEXT NOT NULL DEFAULT 'en',
      summary_json TEXT NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      UNIQUE(token_symbol, lang)
    );

    CREATE INDEX IF NOT EXISTS idx_summary_cache_token ON summary_cache(token_symbol);
    CREATE INDEX IF NOT EXISTS idx_summary_cache_expires ON summary_cache(expires_at);

    CREATE TABLE IF NOT EXISTS alert_preferences (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      token_symbols TEXT NOT NULL DEFAULT '[]',
      channels TEXT NOT NULL DEFAULT '[]',
      sensitivity TEXT NOT NULL DEFAULT 'medium',
      news_frequency_threshold INTEGER NOT NULL DEFAULT 3,
      news_window_minutes INTEGER NOT NULL DEFAULT 60,
      price_change_threshold DOUBLE PRECISION NOT NULL DEFAULT 5.0,
      volume_change_threshold DOUBLE PRECISION NOT NULL DEFAULT 100.0,
      sentiment_change_threshold DOUBLE PRECISION NOT NULL DEFAULT 30.0,
      whale_transaction_threshold DOUBLE PRECISION NOT NULL DEFAULT 1000000.0,
      min_signals INTEGER NOT NULL DEFAULT 2,
      enabled INTEGER NOT NULL DEFAULT 1,
      telegram_chat_id TEXT,
      email_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_alert_prefs_user ON alert_preferences(user_id);

    CREATE TABLE IF NOT EXISTS triggered_alerts (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      token_symbol TEXT NOT NULL,
      signals TEXT NOT NULL,
      signal_count INTEGER NOT NULL,
      summary TEXT NOT NULL,
      delivered_channels TEXT NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_triggered_alerts_user ON triggered_alerts(user_id);
    CREATE INDEX IF NOT EXISTS idx_triggered_alerts_token ON triggered_alerts(token_symbol);
    CREATE INDEX IF NOT EXISTS idx_triggered_alerts_created ON triggered_alerts(created_at);

    CREATE TABLE IF NOT EXISTS missed_alerts (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_symbol TEXT NOT NULL,
      signals TEXT NOT NULL,
      signal_count INTEGER NOT NULL,
      summary TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_missed_alerts_user ON missed_alerts(user_id);
    CREATE INDEX IF NOT EXISTS idx_missed_alerts_created ON missed_alerts(created_at);
    CREATE INDEX IF NOT EXISTS idx_missed_alerts_user_date ON missed_alerts(user_id, created_at);

    CREATE TABLE IF NOT EXISTS digest_subscribers (
      id SERIAL PRIMARY KEY,
      email TEXT,
      telegram_chat_id TEXT,
      lang TEXT NOT NULL DEFAULT 'en',
      active INTEGER NOT NULL DEFAULT 1,
      unsubscribe_token TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_digest_subs_email ON digest_subscribers(email);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_digest_subs_telegram ON digest_subscribers(telegram_chat_id);
    CREATE INDEX IF NOT EXISTS idx_digest_subs_active ON digest_subscribers(active);

    CREATE TABLE IF NOT EXISTS digest_history (
      id SERIAL PRIMARY KEY,
      lang TEXT NOT NULL,
      subject TEXT NOT NULL,
      content_html TEXT NOT NULL,
      content_telegram TEXT NOT NULL,
      emails_sent INTEGER NOT NULL DEFAULT 0,
      telegrams_sent INTEGER NOT NULL DEFAULT 0,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_digest_history_generated ON digest_history(generated_at);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      tier TEXT NOT NULL DEFAULT 'free',
      stripe_customer_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_users_stripe ON users(stripe_customer_id);

    CREATE TABLE IF NOT EXISTS magic_links (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_magic_links_token ON magic_links(token);
    CREATE INDEX IF NOT EXISTS idx_magic_links_email ON magic_links(email);

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      stripe_subscription_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      plan TEXT NOT NULL DEFAULT 'pro',
      current_period_start TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);

    CREATE TABLE IF NOT EXISTS api_usage (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      endpoint TEXT NOT NULL,
      request_date TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_api_usage_user_date ON api_usage(user_id, request_date);

    CREATE TABLE IF NOT EXISTS affiliate_clicks (
      id SERIAL PRIMARY KEY,
      token_symbol TEXT NOT NULL,
      exchange TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_token ON affiliate_clicks(token_symbol);
    CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_exchange ON affiliate_clicks(exchange);

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Default',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

    CREATE TABLE IF NOT EXISTS social_mentions (
      id SERIAL PRIMARY KEY,
      token_symbol TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'twitter',
      mention_count INTEGER NOT NULL DEFAULT 0,
      sentiment_score DOUBLE PRECISION NOT NULL DEFAULT 0,
      sentiment_label TEXT NOT NULL DEFAULT 'neutral',
      positive_count INTEGER NOT NULL DEFAULT 0,
      negative_count INTEGER NOT NULL DEFAULT 0,
      neutral_count INTEGER NOT NULL DEFAULT 0,
      sample_texts TEXT NOT NULL DEFAULT '[]',
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(token_symbol, source, fetched_at)
    );

    CREATE INDEX IF NOT EXISTS idx_social_mentions_token ON social_mentions(token_symbol);
    CREATE INDEX IF NOT EXISTS idx_social_mentions_fetched ON social_mentions(fetched_at);
    CREATE INDEX IF NOT EXISTS idx_social_mentions_token_fetched ON social_mentions(token_symbol, fetched_at);
    CREATE INDEX IF NOT EXISTS idx_social_mentions_source_token_fetched ON social_mentions(source, token_symbol, fetched_at);

    CREATE TABLE IF NOT EXISTS whale_transactions (
      id SERIAL PRIMARY KEY,
      token_symbol TEXT NOT NULL,
      transaction_hash TEXT NOT NULL UNIQUE,
      from_address TEXT,
      to_address TEXT,
      amount DOUBLE PRECISION NOT NULL,
      amount_usd DOUBLE PRECISION NOT NULL,
      blockchain TEXT NOT NULL DEFAULT 'unknown',
      transaction_type TEXT NOT NULL DEFAULT 'transfer',
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_whale_tx_token ON whale_transactions(token_symbol);
    CREATE INDEX IF NOT EXISTS idx_whale_tx_fetched ON whale_transactions(fetched_at);
    CREATE INDEX IF NOT EXISTS idx_whale_tx_token_fetched ON whale_transactions(token_symbol, fetched_at);
    CREATE INDEX IF NOT EXISTS idx_whale_tx_hash ON whale_transactions(transaction_hash);

    CREATE TABLE IF NOT EXISTS scheduler_errors (
      id SERIAL PRIMARY KEY,
      task_name TEXT NOT NULL,
      error_message TEXT NOT NULL,
      error_stack TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_scheduler_errors_task ON scheduler_errors(task_name);
    CREATE INDEX IF NOT EXISTS idx_scheduler_errors_created ON scheduler_errors(created_at);
  `);
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Create a test pool pointing to a test database */
export function createTestPool(): Pool {
  return new Pool({
    connectionString: process.env.TEST_DATABASE_URL || "postgresql://localhost:5432/wavedge_test",
    max: 5,
  });
}
