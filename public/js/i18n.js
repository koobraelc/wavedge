/**
 * Lightweight i18n module for Wavedge.
 * No dependencies — works with vanilla JS + Web Components.
 *
 * Usage:
 *   await window.i18n.init();
 *   window.i18n.t('nav.dashboard');              // "Dashboard"
 *   window.i18n.t('time.mAgo', { n: 5 });       // "5m ago"
 *   window.i18n.t('feed.historicalTooltip', { samples: 3, plural: 's' }); // interpolation
 */
(function () {
  'use strict';

  const SUPPORTED_LOCALES = ['en', 'zh-tw', 'ja', 'ko'];
  const DEFAULT_LOCALE = 'en';
  const STORAGE_KEY = 'preferred-locale';

  let _locale = DEFAULT_LOCALE;
  let _messages = {};
  // Inline English fallback — ensures translations work even if XHR fails
  let _fallback = {
    "nav.dashboard": "Dashboard",
    "nav.market": "Market",
    "nav.alerts": "Alerts",
    "nav.billing": "Billing",
    "nav.login": "Log in",
    "nav.logout": "Log out",
    "nav.searchPlaceholder": "Search tokens or news...",
    "nav.searchLabel": "Search",
    "nav.settings": "Settings",
    "nav.alertSettings": "Alert Settings",
    "nav.watchlist": "Watchlist",
    "nav.apiKeys": "API Keys",
    "nav.compare": "Compare",
    "nav.switchTheme": "Theme",
    "nav.language": "Language",
    "welcome.title": "Welcome to Wavedge!",
    "welcome.description": "Your crypto intelligence dashboard is ready. Here's how to get started:",
    "welcome.setupWatchlist": "Set up Watchlist",
    "welcome.learnImpact": "Learn about Impact Scores",
    "welcome.setupAlerts": "Configure Alerts",
    "welcome.dismiss": "Dismiss",
    "heatmap.title": "Signal Heatmap",
    "heatmap.tip": "Signals = a composite indicator of news volume + social discussion + whale activity. More signals means this token is worth watching.",
    "heatmap.legendUp": "Up",
    "heatmap.legendDown": "Down",
    "heatmap.legendSize": "Larger = higher market cap",
    "heatmap.legendNews": "News",
    "heatmap.legendSocial": "Social",
    "heatmap.legendWhale": "Whales",
    "heatmap.noData": "No token data",
    "heatmap.articles24h": "{count} articles (24h)",
    "heatmap.sentiment": "Sentiment: {label}",
    "heatmap.whale": "Whale: {count} txs",
    "feed.noArticles": "No articles yet",
    "feed.avg": "avg",
    "feed.historicalTooltip": "Historical avg 24h price change based on {samples} similar event{plural}",
    "feed.newsTooltip": "{category} news: ",
    "time.justNow": "just now",
    "time.mAgo": "{n}m ago",
    "time.hAgo": "{n}h ago",
    "time.dAgo": "{n}d ago",
    "stats.btcPrice": "BTC Price",
    "stats.ethPrice": "ETH Price",
    "stats.price": "Price",
    "stats.sentiment": "Market Sentiment",
    "stats.marketCap": "Total Market Cap",
    "stats.neutral": "Neutral",
    "stats.na": "N/A",
    "stats.24h": "24h",
    "chart.selectToken": "Select a token to view chart",
    "chart.line": "Line",
    "chart.candlestick": "Candlestick",
    "chart.clickToLoad": "Click a token row to load its price chart",
    "chart.loading": "Loading chart...",
    "chart.noData": "No historical data available",
    "chart.failed": "Failed to load chart data",
    "table.rank": "#",
    "table.token": "Token",
    "table.price": "Price (USD)",
    "table.change24h": "24h Change",
    "table.marketCap": "Market Cap",
    "table.volume": "Volume (24h)",
    "table.noData": "No price data yet — updates every 5 minutes",
    "impact.all": "All",
    "impact.noArticles": "No articles yet",
    "impact.emptyTitle": "No articles yet",
    "impact.emptyAction": "Add tokens to your watchlist to see related news",
    "impact.setAlert": "Set Alert",
    "stale.delayed": "Data may be delayed (last update: {age} ago)",
    "stale.dismiss": "Dismiss",
    "watchlist.topTokens": "Top Tokens",
    "watchlist.yourWatchlist": "Your Watchlist",
    "watchlist.token": "Token",
    "watchlist.price": "Price",
    "watchlist.change24h": "24h",
    "watchlist.signals": "Signals",
    "watchlist.signalsTip": "The number of news articles and events related to this token in the past 24 hours.",
    "watchlist.emptyTitle": "No tokens on your watchlist yet",
    "watchlist.emptyAction": "Add tokens in Settings",
    "watchlist.loadFailed": "Unable to load watchlist",
    "bottomNav.dashboard": "Dashboard",
    "bottomNav.market": "Market",
    "bottomNav.alerts": "Alerts",
    "bottomNav.tokens": "Tokens",
    "bottomNav.settings": "Settings",
    "missed.upgrade": "Upgrade to Pro",
    "upgrade.title": "Upgrade to Pro",
    "upgrade.cta": "Upgrade — $19/mo",
    "market.noData": "No price data available yet.",
    "market.loadFailed": "Failed to load market data.",
    "market.loading": "Loading..."
  };
  let _ready = false;

  /**
   * Detect locale from URL path, localStorage, or browser language.
   * Priority: URL path > localStorage > navigator.language > 'en'
   */
  function detectLocale() {
    // 1. URL path: /zh-tw/dashboard → 'zh-tw'
    const pathMatch = window.location.pathname.match(/^\/(zh-tw|ja|ko)(?:\/|$)/);
    if (pathMatch && SUPPORTED_LOCALES.includes(pathMatch[1])) {
      return pathMatch[1];
    }

    // 2. localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LOCALES.includes(stored)) {
      return stored;
    }

    // 3. navigator.language / Accept-Language
    const browserLang = (navigator.language || '').toLowerCase();
    if (browserLang.startsWith('zh')) return 'zh-tw';
    if (browserLang.startsWith('ja')) return 'ja';
    if (browserLang.startsWith('ko')) return 'ko';

    // 4. Fallback
    return DEFAULT_LOCALE;
  }

  /**
   * Load a locale JSON file synchronously (for initial load)
   * or asynchronously (for lazy loading).
   */
  function loadLocaleSync(locale) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `/locales/${locale}.json`, false);
      xhr.send();
      if (xhr.status === 200) return JSON.parse(xhr.responseText);
    } catch (err) {
      console.warn(`[i18n] Failed to load locale "${locale}":`, err.message);
    }
    return {};
  }

  async function loadLocale(locale) {
    try {
      const resp = await fetch(`/locales/${locale}.json`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      console.warn(`[i18n] Failed to load locale "${locale}":`, err.message);
      return {};
    }
  }

  /**
   * Translate a key, with optional {variable} interpolation.
   * Falls back to English, then to the key itself.
   *
   * @param {string} key - Dot-namespaced key, e.g. 'nav.dashboard'
   * @param {Object} [params] - Interpolation values, e.g. { n: 5 }
   * @returns {string}
   */
  function t(key, params) {
    let str = _messages[key] || _fallback[key] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      }
    }
    return str;
  }

  /**
   * Switch locale: save preference and redirect to locale subdirectory.
   */
  function setLocale(locale) {
    if (!SUPPORTED_LOCALES.includes(locale)) return;
    localStorage.setItem(STORAGE_KEY, locale);

    // Strip existing locale prefix from path
    let path = window.location.pathname.replace(/^\/(zh-tw|ja|ko)(\/|$)/, '/');

    // Add new locale prefix (skip for 'en' which uses root)
    if (locale !== DEFAULT_LOCALE) {
      path = '/' + locale + (path === '/' ? '' : path);
    }

    window.location.href = path + window.location.search + window.location.hash;
  }

  /**
   * Initialize i18n synchronously: detect locale, load English fallback,
   * then load target locale. Uses sync XHR so t() works immediately
   * when components render in connectedCallback.
   */
  function init() {
    _locale = detectLocale();

    // Try to load full English from server (merges on top of inline fallback)
    var loaded = loadLocaleSync('en');
    if (loaded && Object.keys(loaded).length > 0) {
      Object.assign(_fallback, loaded);
    }

    if (_locale !== 'en') {
      // Load target locale sync so t() works immediately
      _messages = loadLocaleSync(_locale);
    } else {
      _messages = _fallback;
    }

    // Set <html lang>
    document.documentElement.lang = _locale === 'zh-tw' ? 'zh-Hant' : _locale;

    _ready = true;
    return Promise.resolve();
  }

  // Public API
  window.i18n = {
    init,
    t,
    setLocale,
    detectLocale,
    get locale() { return _locale; },
    get ready() { return _ready; },
    SUPPORTED_LOCALES,
    LOCALE_LABELS: {
      'en': 'English',
      'zh-tw': '繁體中文',
      'ja': '日本語',
      'ko': '한국어'
    }
  };
})();
