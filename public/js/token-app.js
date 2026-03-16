// Token intelligence page application
(function () {
  'use strict';

  const page = document.querySelector('.token-page');
  const symbol = page.dataset.symbol;
  const tokenName = page.dataset.name;

  // --- Chart ---
  let chart = null;
  let series = null;
  let volumeSeries = null;
  let allPriceData = [];

  const RANGE_LIMITS = { '1d': 24, '1w': 168, '1m': 720, '3m': 2160 };

  async function loadChart() {
    const container = document.getElementById('token-chart');

    try {
      const res = await fetchWithTimeout(`/api/prices/${encodeURIComponent(symbol)}/history?limit=2200`);
      if (!res.ok) throw new Error('Failed to load history');
      const { data } = await res.json();

      if (!data || data.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#128200;</div><div class="empty-state-title">No chart data yet</div><div class="empty-state-desc">We just started tracking this token. Price history will appear after the first data points are collected.</div></div>';
        return;
      }

      allPriceData = data;
      renderChart(container, data);
    } catch (err) {
      console.error('[token-app] Failed to load chart data:', err);
      renderRetryState(container, 'Price Chart', loadChart);
    }
  }

  function renderChart(container, data) {
    if (chart) {
      chart.remove();
      chart = null;
    }
    container.innerHTML = '';

    const chartHeight = window.innerWidth <= 480 ? 280 : 400;
    chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: chartHeight,
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

      // Volume overlay
      volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
      });
      chart.priceScale('').applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });
      const volumeData = candles.map(c => ({
        time: c.time,
        value: c._volume || 0,
        color: c.close >= c.open ? 'rgba(63, 185, 80, 0.3)' : 'rgba(248, 81, 73, 0.3)',
      }));
      volumeSeries.setData(volumeData);
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
        buckets.set(bucket, { time: bucket, open: d.price_usd, high: d.price_usd, low: d.price_usd, close: d.price_usd, _volume: d.total_volume || 0 });
      } else {
        const c = buckets.get(bucket);
        c.high = Math.max(c.high, d.price_usd);
        c.low = Math.min(c.low, d.price_usd);
        c.close = d.price_usd;
        c._volume = Math.max(c._volume, d.total_volume || 0);
      }
    }
    return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
  }

  // Time range selector with active state animation
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => {
        b.classList.remove('active');
        b.classList.remove('range-btn-pop');
      });
      btn.classList.add('active');
      btn.classList.add('range-btn-pop');
      const range = btn.dataset.range;
      const limit = RANGE_LIMITS[range] || 720;
      const filtered = allPriceData.slice(0, limit);
      if (filtered.length > 0) {
        renderChart(document.getElementById('token-chart'), filtered);
      }
    });
  });

  // --- Hero price with animation ---
  let lastHeroPrice = null;

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
        const arrowIcon = pct >= 0 ? '&#9650;' : '&#9660;';

        // Determine flash class
        let flashClass = '';
        if (lastHeroPrice !== null && p !== lastHeroPrice) {
          flashClass = p > lastHeroPrice ? 'hero-price-flash-up' : 'hero-price-flash-down';
        }
        lastHeroPrice = p;

        el.innerHTML = `
          <span class="hero-price-value ${flashClass}">$${fmtPrice(p)}</span>
          <span class="hero-change ${cls}">
            <span class="hero-arrow ${cls}">${arrowIcon}</span>
            ${sign}${pct.toFixed(2)}%
          </span>`;
        if (data.price.market_cap) {
          el.innerHTML += ` <span class="hero-meta">Mkt Cap: $${fmtLargeNum(data.price.market_cap)}</span>`;
        }
        if (data.price.total_volume) {
          el.innerHTML += ` <span class="hero-meta">Vol: $${fmtLargeNum(data.price.total_volume)}</span>`;
        }

        // Remove flash class after animation
        if (flashClass) {
          setTimeout(() => {
            const val = el.querySelector('.hero-price-value');
            if (val) val.classList.remove(flashClass);
          }, 800);
        }
      }
    } catch (err) {
      // Non-critical
    }
  }

  // --- AI Summary with loading state, retry, and timeout ---
  let summaryRetries = 0;
  const MAX_SUMMARY_RETRIES = 2;

  async function loadSummary() {
    const container = document.getElementById('token-summary');

    // Show loading state
    container.innerHTML = `
      <div class="section-header"><h2>AI Weekly Summary</h2><span class="ai-label">AI Generated</span></div>
      <div class="summary-card summary-card-ai">
        <div class="summary-loading">
          <div class="summary-spinner"></div>
          <span>Generating summary&hellip;</span>
        </div>
      </div>`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`/api/tokens/${encodeURIComponent(symbol)}/summary?lang=en`, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) throw new Error('Failed');
      const json = await res.json();

      if (json.status === 'error' || (!json.data && json.status !== 'no_data')) {
        renderSummaryRetry(container, json.message || 'Summary temporarily unavailable.');
        return;
      }

      if (json.status === 'no_data' || !json.data?.summary) {
        container.innerHTML = `
          <div class="section-header"><h2>AI Weekly Summary</h2><span class="ai-label">AI Generated</span></div>
          <div class="summary-card summary-card-ai"><p class="summary-empty">${escHtml(json.message || 'No summary data available yet. Summary will appear when news articles are collected.')}</p></div>`;
        return;
      }

      const rendered = renderMarkdown(json.data.summary);
      container.innerHTML = `
        <div class="section-header"><h2>AI Weekly Summary</h2><span class="ai-label">AI Generated</span></div>
        <div class="summary-card summary-card-ai">
          <div class="summary-text">${rendered}</div>
          <div class="summary-meta">
            <span>Generated ${relativeTime(json.data.generatedAt)}</span>
            <span>&middot;</span>
            <span>${json.data.articleCount} articles analyzed</span>
          </div>
        </div>`;
    } catch (err) {
      if (summaryRetries < MAX_SUMMARY_RETRIES) {
        summaryRetries++;
        setTimeout(loadSummary, 5000);
        return;
      }
      renderSummaryRetry(container, 'Summary unavailable. Tap to retry.');
    }
  }

  function renderSummaryRetry(container, message) {
    container.innerHTML = `
      <div class="section-header"><h2>AI Weekly Summary</h2><span class="ai-label">AI Generated</span></div>
      <div class="summary-card summary-card-ai summary-retry-card">
        <p class="summary-empty">${escHtml(message)}</p>
        <button class="summary-retry-btn">Retry</button>
      </div>`;
    const btn = container.querySelector('.summary-retry-btn');
    if (btn) btn.addEventListener('click', () => { summaryRetries = 0; loadSummary(); });
  }

  function renderMarkdown(text) {
    if (!text) return '';
    // Escape HTML first
    let safe = escHtml(text);
    // **bold**
    safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Bullet points (lines starting with - or *)
    safe = safe.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    safe = safe.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    // Paragraphs
    safe = safe.replace(/\n\n/g, '</p><p>');
    safe = '<p>' + safe + '</p>';
    return safe;
  }

  // --- Impact Statistics with horizontal bar charts ---
  async function loadImpact() {
    const container = document.getElementById('token-impact');
    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(symbol)}/impact`);
      if (!res.ok) throw new Error('Failed');
      const { data } = await res.json();

      if (!data.categories || data.categories.length === 0) {
        container.innerHTML = `
          <div class="section-header"><h2>Impact Statistics</h2></div>
          <div class="empty-state empty-state-inline"><div class="empty-state-icon">&#128202;</div><div class="empty-state-title">Not enough data yet</div><div class="empty-state-desc">Impact scores are calculated from news events and price movements. Data will appear once enough events have been recorded for this token.</div></div>`;
        return;
      }

      // Find max absolute value for scaling bars
      const maxAbs = Math.max(...data.categories.map(c => Math.abs(c.avgChange24h ?? 0)), 1);

      const bars = data.categories.map(cat => {
        const avg24h = cat.avgChange24h ?? 0;
        const cls = avg24h > 0.1 ? 'positive' : avg24h < -0.1 ? 'negative' : 'neutral';
        const sign = avg24h > 0 ? '+' : '';
        const barWidth = Math.min(Math.abs(avg24h) / maxAbs * 100, 100);
        const barColor = avg24h > 0.1 ? 'var(--green)' : avg24h < -0.1 ? 'var(--red)' : 'var(--text-muted)';

        return `
          <div class="impact-bar-row">
            <div class="impact-bar-label">
              <span class="impact-bar-category">${escHtml(cat.category)}</span>
              <span class="impact-bar-meta">${cat.sampleSize} events</span>
            </div>
            <div class="impact-bar-track">
              <div class="impact-bar-fill" style="width: ${barWidth}%; background: ${barColor}"></div>
            </div>
            <span class="impact-bar-value ${cls}">${sign}${avg24h.toFixed(2)}%</span>
          </div>`;
      }).join('');

      container.innerHTML = `
        <div class="section-header">
          <h2>Impact Statistics</h2>
          <span class="section-meta">${data.totalEvents} total events</span>
        </div>
        <div class="impact-bar-chart">${bars}</div>`;
    } catch {
      container.innerHTML = `
        <div class="section-header"><h2>Impact Statistics</h2></div>
        <div class="empty-state empty-state-inline"><div class="empty-state-icon">&#9888;</div><div class="empty-state-title">Unable to load impact data</div><div class="empty-state-desc">Please try refreshing the page.</div></div>`;
    }
  }

  // --- Related News with timeline ---
  async function loadNews() {
    const newsFeed = document.querySelector('news-feed');
    const timelineContainer = document.getElementById('news-timeline');
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

      // Render timeline if we have articles with impacts
      if (timelineContainer && articles.length > 0) {
        renderNewsTimeline(timelineContainer, articles);
      }
    } catch {
      // Non-critical
    }
  }

  function renderNewsTimeline(container, articles) {
    const items = articles.slice(0, 8).map(a => {
      const time = relativeTime(a.published_at || a.fetched_at);
      const impact = a._impact;
      let impactHtml = '';
      if (impact && impact.priceChange24h != null) {
        const pct = impact.priceChange24h;
        const cls = pct > 0 ? 'positive' : pct < 0 ? 'negative' : 'neutral';
        const sign = pct > 0 ? '+' : '';
        impactHtml = `<span class="timeline-impact ${cls}">${sign}${pct.toFixed(2)}%</span>`;
      }
      const category = a.category ? `<span class="timeline-category">${escHtml(a.category)}</span>` : '';

      return `
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-content">
            <div class="timeline-header">
              <span class="timeline-time">${time}</span>
              ${category}
              ${impactHtml}
            </div>
            <a href="${escHtml(a.url || '#')}" target="_blank" rel="noopener" class="timeline-title">${escHtml(a.title)}</a>
            <span class="timeline-source">${escHtml(a.source || '')}</span>
          </div>
        </div>`;
    }).join('');

    container.innerHTML = items || '<div class="empty-state empty-state-inline"><div class="empty-state-icon">&#128240;</div><div class="empty-state-title">No recent events</div><div class="empty-state-desc">No news articles have been recorded for this token recently. Check back soon.</div></div>';
  }

  // --- FAQ Section ---
  async function loadFaq() {
    const container = document.getElementById('token-faq');
    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(symbol)}/faq`);
      if (!res.ok) throw new Error('Failed');
      const { data } = await res.json();

      if (!data.faqs || data.faqs.length === 0) {
        container.innerHTML = '';
        return;
      }

      const faqItems = data.faqs.map((faq, i) => `
        <div class="faq-item${i === 0 ? ' faq-item-open' : ''}">
          <button class="faq-question" aria-expanded="${i === 0 ? 'true' : 'false'}">
            <span>${escHtml(faq.question)}</span>
            <span class="faq-toggle">${i === 0 ? '−' : '+'}</span>
          </button>
          <div class="faq-answer"${i === 0 ? '' : ' style="display:none"'}>
            <p>${escHtml(faq.answer)}</p>
          </div>
        </div>`).join('');

      container.innerHTML = `
        <div class="section-header"><h2>Frequently Asked Questions</h2></div>
        <div class="faq-list">${faqItems}</div>`;

      // Accordion behavior
      container.querySelectorAll('.faq-question').forEach(btn => {
        btn.addEventListener('click', () => {
          const item = btn.parentElement;
          const answer = item.querySelector('.faq-answer');
          const toggle = btn.querySelector('.faq-toggle');
          const isOpen = item.classList.contains('faq-item-open');
          item.classList.toggle('faq-item-open');
          answer.style.display = isOpen ? 'none' : 'block';
          toggle.textContent = isOpen ? '+' : '−';
          btn.setAttribute('aria-expanded', !isOpen);
        });
      });

      // Inject FAQ structured data for SEO
      const faqLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        'mainEntity': data.faqs.map(faq => ({
          '@type': 'Question',
          'name': faq.question,
          'acceptedAnswer': { '@type': 'Answer', 'text': faq.answer }
        }))
      };
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(faqLd);
      document.head.appendChild(script);
    } catch {
      container.innerHTML = '';
    }
  }

  // --- Social Sentiment ---
  async function loadSentiment() {
    const container = document.getElementById('token-sentiment');
    if (!container) return;
    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(symbol)}/sentiment`);
      if (!res.ok) throw new Error('Failed');
      const { data } = await res.json();

      if (!data.current) {
        container.innerHTML = `
          <div class="section-header"><h2>Social Sentiment</h2></div>
          <div class="empty-state empty-state-inline"><div class="empty-state-icon">&#128172;</div><div class="empty-state-title">No social data yet</div><div class="empty-state-desc">Social sentiment is gathered from community discussions. This token may not have enough social mentions to generate a sentiment score.</div></div>`;
        return;
      }

      const c = data.current;
      const labelCls = c.sentimentLabel === 'bullish' ? 'positive' : c.sentimentLabel === 'bearish' ? 'negative' : 'neutral';
      const labelIcon = c.sentimentLabel === 'bullish' ? '&#9650;' : c.sentimentLabel === 'bearish' ? '&#9660;' : '&#9679;';

      let changeHtml = '';
      if (data.change) {
        const ch = data.change.changePercent;
        const chSign = ch > 0 ? '+' : '';
        const chCls = ch > 0 ? 'positive' : ch < 0 ? 'negative' : 'neutral';
        changeHtml = `<span class="sentiment-change ${chCls}">${chSign}${ch.toFixed(1)}% mentions vs prev</span>`;
      }

      // Sentiment breakdown bar
      const total = c.positiveCount + c.negativeCount + c.neutralCount || 1;
      const posPct = (c.positiveCount / total * 100).toFixed(0);
      const negPct = (c.negativeCount / total * 100).toFixed(0);
      const neuPct = (c.neutralCount / total * 100).toFixed(0);

      // Sample texts
      const samplesHtml = c.sampleTexts.length > 0
        ? c.sampleTexts.map(t => `<div class="sentiment-sample">"${escHtml(t)}"</div>`).join('')
        : '';

      container.innerHTML = `
        <div class="section-header">
          <h2>Social Sentiment</h2>
          <span class="section-meta">${escHtml(c.source)}</span>
        </div>
        <div class="sentiment-card">
          <div class="sentiment-overview">
            <div class="sentiment-score">
              <span class="sentiment-label ${labelCls}">${labelIcon} ${escHtml(c.sentimentLabel)}</span>
              <span class="sentiment-mentions">${c.mentionCount.toLocaleString()} mentions (24h)</span>
              ${changeHtml}
            </div>
            <div class="sentiment-breakdown">
              <div class="sentiment-bar">
                <div class="sentiment-bar-pos" style="width: ${posPct}%" title="Positive ${posPct}%"></div>
                <div class="sentiment-bar-neg" style="width: ${negPct}%" title="Negative ${negPct}%"></div>
                <div class="sentiment-bar-neu" style="width: ${neuPct}%" title="Neutral ${neuPct}%"></div>
              </div>
              <div class="sentiment-bar-labels">
                <span class="positive">${posPct}% positive</span>
                <span class="negative">${negPct}% negative</span>
                <span class="neutral">${neuPct}% neutral</span>
              </div>
            </div>
          </div>
          ${samplesHtml ? `<div class="sentiment-samples">${samplesHtml}</div>` : ''}
        </div>`;
    } catch {
      if (container) {
        container.innerHTML = `
          <div class="section-header"><h2>Social Sentiment</h2></div>
          <div class="empty-state empty-state-inline"><div class="empty-state-icon">&#9888;</div><div class="empty-state-title">Unable to load sentiment</div><div class="empty-state-desc">Please try refreshing the page.</div></div>`;
      }
    }
  }

  // --- Related Tokens ---
  async function loadRelated() {
    const container = document.getElementById('token-related');
    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(symbol)}/related`);
      if (!res.ok) throw new Error('Failed');
      const { data } = await res.json();

      if (!data.related || data.related.length === 0) {
        container.innerHTML = '';
        return;
      }

      const chips = data.related.map(t => `
        <a href="/tokens/${encodeURIComponent(t.symbol)}" class="related-token-chip">
          <span class="related-token-symbol">${escHtml(t.symbol)}</span>
          <span class="related-token-name">${escHtml(t.name)}</span>
          <span class="related-token-count">${t.coMentions} shared articles</span>
        </a>`).join('');

      container.innerHTML = `
        <div class="section-header">
          <h2>Related Tokens</h2>
          <span class="section-meta">Co-mentioned in recent news</span>
        </div>
        <div class="related-tokens-grid">${chips}</div>`;
    } catch {
      container.innerHTML = '';
    }
  }

  // --- Utilities ---
  /** Fetch with AbortController timeout (default 10s) */
  function fetchWithTimeout(url, opts = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(id));
  }

  /** Show a "Something went wrong" state with retry button */
  function renderRetryState(container, title, retryFn) {
    container.innerHTML = `
      <div class="section-header"><h2>${escHtml(title)}</h2></div>
      <div class="empty-state empty-state-inline">
        <div class="empty-state-icon">&#9888;</div>
        <div class="empty-state-title">Something went wrong</div>
        <div class="empty-state-desc">Tap to retry</div>
        <button class="retry-btn">Retry</button>
      </div>`;
    const btn = container.querySelector('.retry-btn');
    if (btn) btn.addEventListener('click', retryFn);
  }

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

  // --- Batch load: impact, sentiment, related, faq, news in a single API call ---
  async function loadBatchData() {
    try {
      const res = await fetchWithTimeout(`/api/tokens/${encodeURIComponent(symbol)}/batch`);
      if (!res.ok) {
        // Fallback to individual calls if batch fails
        await Promise.all([loadImpact(), loadSentiment(), loadFaq(), loadRelated(), loadNews()]);
        return;
      }
      const { data } = await res.json();

      // Render impact
      renderImpactFromData(data.impact);
      // Render sentiment
      renderSentimentFromData(data.sentiment);
      // Render related
      renderRelatedFromData(data.related);
      // Render FAQ
      renderFaqFromData(data.faq);
      // Render news from overview data
      renderNewsFromData(data.overview);
    } catch {
      // Fallback to individual calls
      await Promise.all([loadImpact(), loadSentiment(), loadFaq(), loadRelated(), loadNews()]);
    }
  }

  function renderImpactFromData(data) {
    const container = document.getElementById('token-impact');
    if (!data || !data.categories || data.categories.length === 0) {
      container.innerHTML = `
        <div class="section-header"><h2>Impact Statistics</h2></div>
        <p class="loading-state">No impact data recorded yet.</p>`;
      return;
    }
    const maxAbs = Math.max(...data.categories.map(c => Math.abs(c.avgChange24h ?? 0)), 1);
    const bars = data.categories.map(cat => {
      const avg24h = cat.avgChange24h ?? 0;
      const cls = avg24h > 0.1 ? 'positive' : avg24h < -0.1 ? 'negative' : 'neutral';
      const sign = avg24h > 0 ? '+' : '';
      const barWidth = Math.min(Math.abs(avg24h) / maxAbs * 100, 100);
      const barColor = avg24h > 0.1 ? 'var(--green)' : avg24h < -0.1 ? 'var(--red)' : 'var(--text-muted)';
      return `
        <div class="impact-bar-row">
          <div class="impact-bar-label">
            <span class="impact-bar-category">${escHtml(cat.category)}</span>
            <span class="impact-bar-meta">${cat.sampleSize} events</span>
          </div>
          <div class="impact-bar-track">
            <div class="impact-bar-fill" style="width: ${barWidth}%; background: ${barColor}"></div>
          </div>
          <span class="impact-bar-value ${cls}">${sign}${avg24h.toFixed(2)}%</span>
        </div>`;
    }).join('');
    container.innerHTML = `
      <div class="section-header">
        <h2>Impact Statistics</h2>
        <span class="section-meta">${data.totalEvents} total events</span>
      </div>
      <div class="impact-bar-chart">${bars}</div>`;
  }

  function renderSentimentFromData(data) {
    const container = document.getElementById('token-sentiment');
    if (!container) return;
    if (!data || !data.current) {
      container.innerHTML = `
        <div class="section-header"><h2>Social Sentiment</h2></div>
        <div class="empty-state empty-state-inline"><div class="empty-state-icon">&#128172;</div><div class="empty-state-title">No social data yet</div><div class="empty-state-desc">Social sentiment is gathered from community discussions.</div></div>`;
      return;
    }
    const c = data.current;
    const labelCls = c.sentimentLabel === 'bullish' ? 'positive' : c.sentimentLabel === 'bearish' ? 'negative' : 'neutral';
    const labelIcon = c.sentimentLabel === 'bullish' ? '&#9650;' : c.sentimentLabel === 'bearish' ? '&#9660;' : '&#9679;';
    let changeHtml = '';
    if (data.change) {
      const ch = data.change.changePercent;
      const chSign = ch > 0 ? '+' : '';
      const chCls = ch > 0 ? 'positive' : ch < 0 ? 'negative' : 'neutral';
      changeHtml = `<span class="sentiment-change ${chCls}">${chSign}${ch.toFixed(1)}% mentions vs prev</span>`;
    }
    const total = c.positiveCount + c.negativeCount + c.neutralCount || 1;
    const posPct = (c.positiveCount / total * 100).toFixed(0);
    const negPct = (c.negativeCount / total * 100).toFixed(0);
    const neuPct = (c.neutralCount / total * 100).toFixed(0);
    const samplesHtml = c.sampleTexts && c.sampleTexts.length > 0
      ? c.sampleTexts.map(t => `<div class="sentiment-sample">"${escHtml(t)}"</div>`).join('')
      : '';
    container.innerHTML = `
      <div class="section-header">
        <h2>Social Sentiment</h2>
        <span class="section-meta">${escHtml(c.source)}</span>
      </div>
      <div class="sentiment-card">
        <div class="sentiment-overview">
          <div class="sentiment-score">
            <span class="sentiment-label ${labelCls}">${labelIcon} ${escHtml(c.sentimentLabel)}</span>
            <span class="sentiment-mentions">${c.mentionCount.toLocaleString()} mentions (24h)</span>
            ${changeHtml}
          </div>
          <div class="sentiment-breakdown">
            <div class="sentiment-bar">
              <div class="sentiment-bar-pos" style="width: ${posPct}%" title="Positive ${posPct}%"></div>
              <div class="sentiment-bar-neg" style="width: ${negPct}%" title="Negative ${negPct}%"></div>
              <div class="sentiment-bar-neu" style="width: ${neuPct}%" title="Neutral ${neuPct}%"></div>
            </div>
            <div class="sentiment-bar-labels">
              <span class="positive">${posPct}% positive</span>
              <span class="negative">${negPct}% negative</span>
              <span class="neutral">${neuPct}% neutral</span>
            </div>
          </div>
        </div>
        ${samplesHtml ? `<div class="sentiment-samples">${samplesHtml}</div>` : ''}
      </div>`;
  }

  function renderRelatedFromData(data) {
    const container = document.getElementById('token-related');
    if (!data || !data.related || data.related.length === 0) {
      container.innerHTML = '';
      return;
    }
    const chips = data.related.map(t => `
      <a href="/tokens/${encodeURIComponent(t.symbol)}" class="related-token-chip">
        <span class="related-token-symbol">${escHtml(t.symbol)}</span>
        <span class="related-token-name">${escHtml(t.name)}</span>
        <span class="related-token-count">${t.coMentions} shared articles</span>
      </a>`).join('');
    container.innerHTML = `
      <div class="section-header">
        <h2>Related Tokens</h2>
        <span class="section-meta">Co-mentioned in recent news</span>
      </div>
      <div class="related-tokens-grid">${chips}</div>`;
  }

  function renderFaqFromData(data) {
    const container = document.getElementById('token-faq');
    if (!data || !data.faqs || data.faqs.length === 0) {
      container.innerHTML = '';
      return;
    }
    const faqItems = data.faqs.map((faq, i) => `
      <div class="faq-item${i === 0 ? ' faq-item-open' : ''}">
        <button class="faq-question" aria-expanded="${i === 0 ? 'true' : 'false'}">
          <span>${escHtml(faq.question)}</span>
          <span class="faq-toggle">${i === 0 ? '−' : '+'}</span>
        </button>
        <div class="faq-answer"${i === 0 ? '' : ' style="display:none"'}>
          <p>${escHtml(faq.answer)}</p>
        </div>
      </div>`).join('');
    container.innerHTML = `
      <div class="section-header"><h2>Frequently Asked Questions</h2></div>
      <div class="faq-list">${faqItems}</div>`;
    container.querySelectorAll('.faq-question').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.parentElement;
        const answer = item.querySelector('.faq-answer');
        const toggle = btn.querySelector('.faq-toggle');
        const isOpen = item.classList.contains('faq-item-open');
        item.classList.toggle('faq-item-open');
        answer.style.display = isOpen ? 'none' : 'block';
        toggle.textContent = isOpen ? '+' : '−';
        btn.setAttribute('aria-expanded', !isOpen);
      });
    });
    // FAQ structured data for SEO
    const faqLd = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'mainEntity': data.faqs.map(faq => ({
        '@type': 'Question',
        'name': faq.question,
        'acceptedAnswer': { '@type': 'Answer', 'text': faq.answer }
      }))
    };
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(faqLd);
    document.head.appendChild(script);
  }

  function renderNewsFromData(overview) {
    const newsFeed = document.querySelector('news-feed');
    const timelineContainer = document.getElementById('news-timeline');
    const articles = overview?.recentNews || [];
    if (articles.length > 0) {
      newsFeed.update(articles);
      // Enrich with impact data (non-blocking)
      enrichNewsImpacts(articles, newsFeed, timelineContainer);
    }
  }

  async function enrichNewsImpacts(articles, newsFeed, timelineContainer) {
    const ids = articles.slice(0, 5).map(a => a.id);
    if (ids.length === 0) return;
    try {
      const res = await fetch('/api/news/batch-impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      if (!res.ok) return;
      const { data: impactMap } = await res.json();
      if (!impactMap) return;
      for (const [idStr, impact] of Object.entries(impactMap)) {
        const idx = articles.findIndex(a => a.id === Number(idStr));
        if (idx !== -1) articles[idx] = { ...articles[idx], _impact: impact };
      }
      newsFeed.update(articles);
      if (timelineContainer && articles.length > 0) renderNewsTimeline(timelineContainer, articles);
    } catch { /* non-critical */ }
  }

  // --- Init: batch load + parallel independent calls ---
  Promise.all([
    loadHeroPrice(),
    loadChart(),
    loadSummary(),
    loadBatchData(),
  ]);
})();
