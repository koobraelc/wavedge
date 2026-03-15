// Main dashboard application
(function () {
  'use strict';

  // --- State ---
  let pricesData = [];
  let newsData = [];

  // --- DOM refs ---
  const statsRow = document.querySelector('stats-row');
  const priceTable = document.querySelector('price-table');
  const newsFeed = document.querySelector('news-feed');
  const priceChart = document.querySelector('price-chart');

  // --- Tabs ---
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach(p => {
        p.classList.toggle('active', p.id === target);
      });
    });
  });

  // --- Token click → chart ---
  document.addEventListener('token-select', async (e) => {
    const symbol = e.detail.symbol;
    const price = pricesData.find(p => p.symbol === symbol);
    await priceChart.loadToken(symbol, price);
  });

  // --- Search ---
  document.addEventListener('nav-search', async (e) => {
    const q = e.detail.query;
    if (!q) {
      // Reset to full view
      priceTable.update(pricesData);
      newsFeed.update(newsData);
      return;
    }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const { data } = await res.json();
      if (data.tokens && data.tokens.length) {
        priceTable.update(data.tokens);
      }
      if (data.articles && data.articles.length) {
        newsFeed.update(data.articles);
      }
    } catch (err) {
      console.error('Search failed:', err);
    }
  });

  // --- Data loading ---
  async function loadPrices() {
    try {
      const res = await fetch('/api/prices');
      const json = await res.json();
      pricesData = json.data || [];
      priceTable.update(pricesData);
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

      // Load impact data for first 10 articles (don't block render)
      newsFeed.update(newsData);
      loadImpacts(newsData.slice(0, 10));

      return newsData;
    } catch (err) {
      console.error('Failed to load news:', err);
      return [];
    }
  }

  async function loadImpacts(articles) {
    const enriched = [...newsData];
    let changed = false;

    for (const article of articles) {
      try {
        const res = await fetch(`/api/news/${article.id}/impact`);
        if (res.ok) {
          const { data } = await res.json();
          const idx = enriched.findIndex(a => a.id === article.id);
          if (idx !== -1) {
            enriched[idx] = { ...enriched[idx], _impact: data };
            changed = true;
          }
        }
      } catch {
        // Impact data not available — skip silently
      }
    }

    if (changed) {
      newsData = enriched;
      newsFeed.update(newsData);
    }
  }

  // --- Initial load ---
  async function init() {
    const [prices, news] = await Promise.all([loadPrices(), loadNews()]);
    const newsCount = news.length;
    statsRow.update(prices, newsCount);

    // Auto-load chart for top token
    if (prices.length > 0) {
      priceChart.loadToken(prices[0].symbol, prices[0]);
    }
  }

  init();

  // Refresh every 60s
  setInterval(async () => {
    const [prices, news] = await Promise.all([loadPrices(), loadNews()]);
    statsRow.update(prices, news.length);
  }, 60000);
})();
