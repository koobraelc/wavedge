// Token intelligence page application
(function () {
  'use strict';

  const page = document.querySelector('.token-page');
  const symbol = page.dataset.symbol;
  const tokenName = page.dataset.name;

  // --- Chart ---
  let chart = null;
  let series = null;
  let allPriceData = [];

  const RANGE_LIMITS = { '1d': 24, '1w': 168, '1m': 720, '3m': 2160 };

  async function loadChart() {
    const container = document.getElementById('token-chart');

    try {
      const res = await fetch(`/api/prices/${encodeURIComponent(symbol)}/history?limit=2200`);
      if (!res.ok) throw new Error('Failed to load history');
      const { data } = await res.json();

      if (!data || data.length === 0) {
        container.innerHTML = '<div class="placeholder">No historical data available</div>';
        return;
      }

      allPriceData = data;
      renderChart(container, data);
    } catch (err) {
      console.error('[token-app] Failed to load chart data:', err);
      container.innerHTML = '<div class="placeholder">Failed to load chart data</div>';
    }
  }

  function renderChart(container, data) {
    if (chart) {
      chart.remove();
      chart = null;
    }
    container.innerHTML = '';

    chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: 400,
      layout: {
        background: { color: '#161b22' },
        textColor: '#8b949e',
      },
      grid: {
        vertLines: { color: '#21262d' },
        horzLines: { color: '#21262d' },
      },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#30363d' },
      timeScale: { borderColor: '#30363d', timeVisible: true },
    });

    const candles = toCandles(data, 3600);

    if (candles.length > 1) {
      series = chart.addCandlestickSeries({
        upColor: '#3fb950',
        downColor: '#f85149',
        borderDownColor: '#f85149',
        borderUpColor: '#3fb950',
        wickDownColor: '#f85149',
        wickUpColor: '#3fb950',
      });
      series.setData(candles);
    } else {
      series = chart.addLineSeries({
        color: '#1f6feb',
        lineWidth: 2,
      });
      const lineData = data
        .map(d => ({ time: Math.floor(new Date(d.fetched_at).getTime() / 1000), value: d.price_usd }))
        .sort((a, b) => a.time - b.time);
      series.setData(lineData);
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    ro.observe(container);
  }

  function toCandles(data, intervalSec) {
    const buckets = new Map();
    for (const d of data) {
      const ts = Math.floor(new Date(d.fetched_at).getTime() / 1000);
      const bucket = Math.floor(ts / intervalSec) * intervalSec;
      if (!buckets.has(bucket)) {
        buckets.set(bucket, { time: bucket, open: d.price_usd, high: d.price_usd, low: d.price_usd, close: d.price_usd });
      } else {
        const c = buckets.get(bucket);
        c.high = Math.max(c.high, d.price_usd);
        c.low = Math.min(c.low, d.price_usd);
        c.close = d.price_usd;
      }
    }
    return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
  }

  // Time range selector
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const range = btn.dataset.range;
      const limit = RANGE_LIMITS[range] || 720;
      const filtered = allPriceData.slice(0, limit);
      if (filtered.length > 0) {
        renderChart(document.getElementById('token-chart'), filtered);
      }
    });
  });

  // --- Hero price ---
  async function loadHeroPrice() {
    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(symbol)}`);
      if (!res.ok) return;
      const { data } = await res.json();
      const el = document.getElementById('hero-price');
      if (data.price) {
        const p = data.price.price_usd;
        const pct = data.price.price_change_percentage_24h ?? 0;
        const sign = pct >= 0 ? '+' : '';
        const cls = pct >= 0 ? 'change-positive' : 'change-negative';
        el.innerHTML = `<span class="hero-price-value">$${fmtPrice(p)}</span> <span class="${cls}">${sign}${pct.toFixed(2)}%</span>`;
        if (data.price.market_cap) {
          el.innerHTML += ` <span class="hero-meta">Mkt Cap: $${fmtLargeNum(data.price.market_cap)}</span>`;
        }
        if (data.price.total_volume) {
          el.innerHTML += ` <span class="hero-meta">Vol: $${fmtLargeNum(data.price.total_volume)}</span>`;
        }
      }
    } catch (err) {
      // Non-critical
    }
  }

  // --- AI Summary ---
  async function loadSummary() {
    const container = document.getElementById('token-summary');
    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(symbol)}/summary?lang=en`);
      if (!res.ok) throw new Error('Failed');
      const { data, message } = await res.json();

      if (!data) {
        container.innerHTML = `
          <div class="section-header"><h2>AI Weekly Summary</h2></div>
          <div class="summary-card"><p class="summary-empty">${escHtml(message || 'No summary data available yet.')}</p></div>`;
        return;
      }

      container.innerHTML = `
        <div class="section-header"><h2>AI Weekly Summary</h2></div>
        <div class="summary-card">
          <p class="summary-text">${escHtml(data.summary)}</p>
          <div class="summary-meta">
            <span>Generated ${relativeTime(data.generatedAt)}</span>
            <span>·</span>
            <span>${data.articleCount} articles analyzed</span>
          </div>
        </div>`;
    } catch {
      container.innerHTML = `
        <div class="section-header"><h2>AI Weekly Summary</h2></div>
        <div class="summary-card"><p class="summary-empty">Summary unavailable.</p></div>`;
    }
  }

  // --- Impact Statistics ---
  async function loadImpact() {
    const container = document.getElementById('token-impact');
    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(symbol)}/impact`);
      if (!res.ok) throw new Error('Failed');
      const { data } = await res.json();

      if (!data.categories || data.categories.length === 0) {
        container.innerHTML = `
          <div class="section-header"><h2>Impact Statistics</h2></div>
          <p class="loading-state">No impact data recorded yet.</p>`;
        return;
      }

      const cards = data.categories.map(cat => {
        const avg24h = cat.avgChange24h ?? 0;
        const cls = avg24h > 0.1 ? 'positive' : avg24h < -0.1 ? 'negative' : 'neutral';
        const sign = avg24h > 0 ? '+' : '';
        return `
          <div class="impact-stat-card">
            <div class="impact-stat-category">${escHtml(cat.category)}</div>
            <div class="impact-stat-change ${cls}">${sign}${avg24h.toFixed(2)}%</div>
            <div class="impact-stat-label">avg 24h change</div>
            <div class="impact-stat-meta">${cat.sampleSize} events</div>
          </div>`;
      }).join('');

      container.innerHTML = `
        <div class="section-header">
          <h2>Impact Statistics</h2>
          <span class="section-meta">${data.totalEvents} total events</span>
        </div>
        <div class="impact-grid">${cards}</div>`;
    } catch {
      container.innerHTML = `
        <div class="section-header"><h2>Impact Statistics</h2></div>
        <p class="loading-state">Failed to load impact data.</p>`;
    }
  }

  // --- Related News ---
  async function loadNews() {
    const newsFeed = document.querySelector('news-feed');
    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(symbol)}`);
      if (!res.ok) throw new Error('Failed');
      const { data } = await res.json();
      const articles = data.recentNews || [];
      newsFeed.update(articles);

      // Load impact for first articles
      for (const article of articles.slice(0, 5)) {
        try {
          const impRes = await fetch(`/api/news/${article.id}/impact`);
          if (impRes.ok) {
            const { data: impData } = await impRes.json();
            const idx = articles.findIndex(a => a.id === article.id);
            if (idx !== -1) articles[idx] = { ...articles[idx], _impact: impData };
          }
        } catch { /* skip */ }
      }
      newsFeed.update(articles);
    } catch {
      // Non-critical
    }
  }

  // --- Utilities ---
  function fmtPrice(n) {
    if (n == null) return '—';
    if (n >= 1) return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  }

  function fmtLargeNum(n) {
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    return Number(n).toLocaleString();
  }

  function relativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  function escHtml(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // --- Init ---
  Promise.all([
    loadHeroPrice(),
    loadChart(),
    loadSummary(),
    loadImpact(),
    loadNews(),
  ]);
})();
