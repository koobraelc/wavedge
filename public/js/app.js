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
      const res = await fetch('/api/homepage/social-sentiment');
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

  // --- Data loading ---
  async function loadPrices() {
    try {
      const res = await fetch('/api/prices');
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
      const res = await fetch('/api/news?limit=50');
      const json = await res.json();
      newsData = json.data || [];
      return newsData;
    } catch (err) {
      console.error('Failed to load news:', err);
      return [];
    }
  }

  async function loadImpacts(articles) {
    const enriched = [...newsData];
    let changed = false;

    // Load impacts in parallel batches of 5
    const batch = articles.slice(0, 20);
    const results = await Promise.allSettled(
      batch.map(async (article) => {
        const res = await fetch(`/api/news/${article.id}/impact`);
        if (res.ok) {
          const { data } = await res.json();
          return { id: article.id, impact: data };
        }
        return null;
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const { id, impact } = result.value;
        const idx = enriched.findIndex(a => a.id === id);
        if (idx !== -1) {
          enriched[idx] = { ...enriched[idx], _impact: impact };
          changed = true;
        }
      }
    }

    if (changed) {
      newsData = enriched;
      const pricesMap = buildPricesMap(pricesData);
      impactFeed.update(newsData, pricesMap);
    }
  }

  // --- Initial load ---
  async function init() {
    const [prices, news, socialSentiment] = await Promise.all([loadPrices(), loadNews(), loadSocialSentiment()]);
    const newsCount = news.length;
    statsRow.update(prices, newsCount);

    // Render feed immediately with whatever data we have
    const pricesMap = buildPricesMap(prices);
    impactFeed.update(news, pricesMap);

    // Update signal heatmap with prices, news signals, and social sentiment
    if (signalHeatmap) {
      const newsSignals = impactFeed.getNewsSignals();
      signalHeatmap.update(prices, newsSignals, socialSentiment);
    }

    // Then enrich with impact data (doesn't block initial render)
    loadImpacts(news);
  }

  init();

  // Refresh every 60s
  setInterval(async () => {
    const [prices, news, socialSentiment] = await Promise.all([loadPrices(), loadNews(), loadSocialSentiment()]);
    statsRow.update(prices, news.length);
    const pricesMap = buildPricesMap(prices);
    impactFeed.update(news, pricesMap);
    if (signalHeatmap) {
      const newsSignals = impactFeed.getNewsSignals();
      signalHeatmap.update(prices, newsSignals, socialSentiment);
    }
    if (watchlistWidget) watchlistWidget.refresh();
    loadImpacts(news);
  }, 60000);
})();
