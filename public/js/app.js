// Main dashboard application
(function () {
  'use strict';

  // --- State ---
  let pricesData = [];
  let newsData = [];

  // --- DOM refs ---
  const statsRow = document.querySelector('stats-row');
  const impactFeed = document.querySelector('impact-feed');
  const signalHeatmap = document.querySelector('signal-heatmap');
  const watchlistWidget = document.querySelector('watchlist-widget');
  const signalDetailPanel = document.querySelector('signal-detail-panel');

  // Open signal detail panel when a heatmap cell is clicked
  document.addEventListener('signal-detail-open', (e) => {
    if (!signalDetailPanel) return;
    const d = e.detail;
    signalDetailPanel.open(d.symbol, {
      price: d.price,
      newsSignal: d.newsSignal,
      socialSentiment: d.socialSentiment,
      whaleActivity: d.whaleActivity,
    });
  });

  // --- Search ---
  document.addEventListener('nav-search', async (e) => {
    const q = e.detail.query;
    if (!q) {
      // Reset to full view
      const pricesMap = buildPricesMap(pricesData);
      impactFeed.update(newsData, pricesMap);
      return;
    }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const { data } = await res.json();
      if (data.articles && data.articles.length) {
        const pricesMap = buildPricesMap(pricesData);
        impactFeed.update(data.articles, pricesMap);
      }
    } catch (err) {
      console.error('Search failed:', err);
    }
  });

  // --- Helpers ---
  function buildPricesMap(prices) {
    const map = {};
    for (const p of prices) {
      map[p.symbol.toLowerCase()] = p;
      map[p.symbol.toUpperCase()] = p;
    }
    return map;
  }

  async function loadSocialSentiment() {
    try {
      const res = await fetchWithTimeout('/api/homepage/social-sentiment');
      const json = await res.json();
      const map = new Map();
      for (const t of (json.data?.tokens || [])) {
        map.set(t.symbol, t);
      }
      return map;
    } catch (err) {
      console.error('Failed to load social sentiment:', err);
      return new Map();
    }
  }

  async function loadWhaleActivity() {
    try {
      const res = await fetchWithTimeout('/api/whales/summary/all');
      const json = await res.json();
      const map = new Map();
      for (const w of (json.data || [])) {
        map.set(w.tokenSymbol, w);
      }
      return map;
    } catch (err) {
      console.error('Failed to load whale activity:', err);
      return new Map();
    }
  }

  // --- Fetch with timeout (10s default) ---
  function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(id));
  }

  // --- Data loading ---
  async function loadPrices() {
    try {
      const res = await fetchWithTimeout('/api/prices');
      const json = await res.json();
      pricesData = json.data || [];
      return pricesData;
    } catch (err) {
      console.error('Failed to load prices:', err);
      return [];
    }
  }

  async function loadNews() {
    try {
      const res = await fetchWithTimeout('/api/news?limit=50');
      const json = await res.json();
      newsData = json.data || [];
      return newsData;
    } catch (err) {
      console.error('Failed to load news:', err);
      return [];
    }
  }

  async function loadImpacts(articles) {
    const batch = articles.slice(0, 20);
    if (batch.length === 0) return;

    try {
      const res = await fetchWithTimeout('/api/news/batch-impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: batch.map(a => a.id) })
      });
      if (!res.ok) return;

      const { data: impactMap } = await res.json();
      if (!impactMap) return;

      const enriched = [...newsData];
      let changed = false;

      for (const [idStr, impact] of Object.entries(impactMap)) {
        const idx = enriched.findIndex(a => a.id === Number(idStr));
        if (idx !== -1) {
          enriched[idx] = { ...enriched[idx], _impact: impact };
          changed = true;
        }
      }

      if (changed) {
        newsData = enriched;
        const pricesMap = buildPricesMap(pricesData);
        impactFeed.update(newsData, pricesMap);
      }
    } catch (err) {
      console.error('Failed to load batch impacts:', err);
    }
  }

  // --- Initial load ---
  async function init() {
    const [prices, news, socialSentiment, whaleActivity] = await Promise.all([loadPrices(), loadNews(), loadSocialSentiment(), loadWhaleActivity()]);
    const newsCount = news.length;
    statsRow.update(prices, newsCount);

    // Render feed immediately with whatever data we have
    const pricesMap = buildPricesMap(prices);
    impactFeed.update(news, pricesMap);

    // Update signal heatmap with prices, news signals, social sentiment, and whale activity
    if (signalHeatmap) {
      const newsSignals = impactFeed.getNewsSignals();
      signalHeatmap.update(prices, newsSignals, socialSentiment, whaleActivity);
    }

    // Then enrich with impact data (doesn't block initial render)
    loadImpacts(news);
  }

  init();

  // Refresh every 60s
  setInterval(async () => {
    const [prices, news, socialSentiment, whaleActivity] = await Promise.all([loadPrices(), loadNews(), loadSocialSentiment(), loadWhaleActivity()]);
    statsRow.update(prices, news.length);
    const pricesMap = buildPricesMap(prices);
    impactFeed.update(news, pricesMap);
    if (signalHeatmap) {
      const newsSignals = impactFeed.getNewsSignals();
      signalHeatmap.update(prices, newsSignals, socialSentiment, whaleActivity);
    }
    if (watchlistWidget) watchlistWidget.refresh();
    loadImpacts(news);
  }, 60000);
})();
