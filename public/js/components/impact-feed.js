class ImpactFeed extends HTMLElement {
  constructor() {
    super();
    this._articles = [];
    this._prices = {};
  }

  connectedCallback() {
    this._activeFilter = 'all';
    this.innerHTML = `
      <div class="impact-feed">
        <div class="feed-filter-tabs" id="feed-filters"></div>
        <div id="feed-list" class="feed-list">
          ${this._skeletonCards(6)}
        </div>
      </div>
    `;
  }

  /**
   * Update feed with articles (already enriched with _impact) and prices map
   */
  update(articles, pricesMap) {
    this._articles = articles || [];
    this._prices = pricesMap || {};

    this._renderFilterTabs();
    this._renderFeed();
  }

  /**
   * Returns a Map<symbol, {count, articles}> of symbols with recent articles in last 24 hours.
   * Symbols with 2+ articles are considered "hot".
   */
  getNewsSignals() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const recentByToken = {};

    for (const a of this._articles) {
      const pubTime = new Date(a.published_at).getTime();
      if (pubTime < cutoff) continue;
      const tags = this._parseTags(a.token_tags);
      for (const tag of tags) {
        const key = tag.toUpperCase();
        if (!recentByToken[key]) recentByToken[key] = [];
        recentByToken[key].push(a);
      }
    }

    const signals = new Map();
    for (const [symbol, articles] of Object.entries(recentByToken)) {
      signals.set(symbol, { count: articles.length, articles });
    }
    return signals;
  }

  _renderFilterTabs() {
    const container = this.querySelector('#feed-filters');
    if (!container) return;

    // Collect unique tokens from articles
    const tokenSet = new Set();
    for (const a of this._articles) {
      const tags = this._parseTags(a.token_tags);
      for (const t of tags) tokenSet.add(t.toUpperCase());
    }

    const tokens = Array.from(tokenSet).slice(0, 10);
    if (tokens.length < 2) {
      container.style.display = 'none';
      return;
    }

    container.style.display = '';
    container.innerHTML = `
      <button class="feed-filter-tab${this._activeFilter === 'all' ? ' active' : ''}" data-filter="all">All</button>
      ${tokens.map(t => `<button class="feed-filter-tab${this._activeFilter === t ? ' active' : ''}" data-filter="${this._esc(t)}">${this._esc(t)}</button>`).join('')}
    `;

    container.querySelectorAll('.feed-filter-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this._activeFilter = btn.dataset.filter;
        this._renderFilterTabs();
        this._renderFeed();
      });
    });
  }

  _renderFeed() {
    const list = this.querySelector('#feed-list');
    if (!list) return;

    if (!this._articles.length) {
      list.innerHTML = '<div class="loading-state">No articles yet</div>';
      return;
    }

    // Filter by active token filter
    let filtered = this._articles;
    if (this._activeFilter && this._activeFilter !== 'all') {
      const f = this._activeFilter.toLowerCase();
      filtered = this._articles.filter(a => {
        const tags = this._parseTags(a.token_tags).map(t => t.toLowerCase());
        return tags.includes(f);
      });
    }

    if (!filtered.length) {
      list.innerHTML = '<div class="loading-state">No articles for this token</div>';
      return;
    }

    // Sort by impact magnitude (absolute avg 24h change), highest first
    const sorted = [...filtered].sort((a, b) => {
      const impA = this._getImpactMagnitude(a);
      const impB = this._getImpactMagnitude(b);
      // Primary: impact magnitude descending
      if (impB !== impA) return impB - impA;
      // Secondary: recency
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime();
    });

    list.innerHTML = sorted.map(a => this._renderCard(a)).join('');

    // Draw sparklines after DOM render
    requestAnimationFrame(() => {
      list.querySelectorAll('.feed-sparkline').forEach(canvas => {
        const symbol = canvas.dataset.symbol;
        const change = parseFloat(canvas.dataset.change);
        this._drawSparkline(canvas, change);
      });
    });
  }

  _renderCard(article) {
    const tags = this._parseTags(article.token_tags);
    const time = this._relativeTime(article.published_at);
    const fullTime = this._fullTime(article.published_at);
    const impactTag = this._buildImpactTag(article);
    const magnitude = this._getImpactMagnitude(article);
    const hasHighImpact = magnitude > 1;

    // Summary excerpt (truncate to 120 chars)
    const summary = article.summary
      ? (article.summary.length > 120 ? article.summary.slice(0, 120) + '...' : article.summary)
      : '';

    // Get first token's price data for sparkline + inline price
    const firstToken = tags[0] ? tags[0].toLowerCase() : null;
    const priceData = firstToken ? (this._prices[firstToken] || this._prices[firstToken?.toUpperCase()]) : null;
    const pct = priceData ? (priceData.price_change_percentage_24h ?? 0) : null;
    const priceVal = priceData ? (priceData.current_price || priceData.price || 0) : null;

    // Inline price display
    let priceInline = '';
    if (priceData && priceVal !== null && pct !== null) {
      const priceFmt = this._formatPrice(priceVal);
      const cls = pct >= 0 ? 'change-positive' : 'change-negative';
      const sign = pct >= 0 ? '+' : '';
      priceInline = `<span class="feed-inline-price"><span class="feed-price-val">${priceFmt}</span> <span class="${cls}">${sign}${pct.toFixed(1)}%</span></span>`;
    }

    // Set Alert link for first token
    const alertLink = firstToken
      ? `<a href="/alerts?token=${encodeURIComponent(firstToken.toUpperCase())}" class="feed-alert-link">Set Alert</a>`
      : '';

    return `
      <article class="feed-card${hasHighImpact ? ' feed-card-hot' : ''}">
        <div class="feed-card-left">
          ${tags.length ? `
            <div class="feed-token-icons">
              ${tags.slice(0, 2).map(t => `<span class="feed-token-icon">${this._esc(t.toUpperCase().slice(0, 3))}</span>`).join('')}
            </div>
          ` : ''}
        </div>
        <div class="feed-card-main">
          <div class="feed-headline">
            <a href="${this._esc(article.url)}" target="_blank" rel="noopener">${this._esc(article.title)}</a>
          </div>
          ${summary ? `<div class="feed-summary">${this._esc(summary)}</div>` : ''}
          <div class="feed-meta">
            <span class="source">${this._esc(article.source)}</span>
            <span class="feed-dot">&middot;</span>
            <span class="time-relative">${time}<span class="time-tooltip">${this._esc(fullTime)}</span></span>
            ${tags.length ? '<span class="feed-dot">&middot;</span>' + tags.map(t => `<a href="/tokens/${encodeURIComponent(t.toUpperCase())}" class="token-tag">${this._esc(t.toUpperCase())}</a>`).join(' ') : ''}
            ${priceInline ? '<span class="feed-dot">&middot;</span>' + priceInline : ''}
          </div>
          <div class="feed-card-actions">
            ${impactTag}
            ${alertLink}
          </div>
        </div>
        <div class="feed-card-right">
          ${priceData && pct !== null ? `
            <canvas class="feed-sparkline" data-symbol="${this._esc(firstToken)}" data-change="${pct}" width="48" height="24"></canvas>
          ` : ''}
        </div>
      </article>
    `;
  }

  _formatPrice(n) {
    if (n >= 1000) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (n >= 1) return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  }

  _buildImpactTag(article) {
    if (!article._impact || !article._impact.tokenImpacts || !article._impact.tokenImpacts.length) return '';

    const first = article._impact.tokenImpacts[0];
    if (!first.historical || first.historical.sampleSize < 1) return '';

    const avg24h = first.historical.avgChange24h;
    if (avg24h == null) return '';

    const cls = avg24h > 0.1 ? 'positive' : avg24h < -0.1 ? 'negative' : 'neutral';
    const sign = avg24h > 0 ? '+' : '';
    const cat = article._impact.category || '';
    const samples = first.historical.sampleSize;
    const symbol = first.symbol ? first.symbol.toUpperCase() : '';

    return `
      <div class="feed-impact">
        <span class="impact-badge ${cls}">
          ${symbol ? this._esc(symbol) + ' ' : ''}${sign}${avg24h.toFixed(2)}% avg after ${cat ? this._esc(cat) : 'similar'} news
          <span class="impact-sample">(n=${samples})</span>
        </span>
      </div>
    `;
  }

  _getImpactMagnitude(article) {
    if (!article._impact || !article._impact.tokenImpacts || !article._impact.tokenImpacts.length) return 0;
    const first = article._impact.tokenImpacts[0];
    if (!first.historical || first.historical.sampleSize < 1) return 0;
    const avg24h = first.historical.avgChange24h;
    if (avg24h == null) return 0;
    return Math.abs(avg24h);
  }

  _drawSparkline(canvas, change) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const color = change >= 0 ? '#3fb950' : '#f85149';
    const mid = h / 2;
    const points = 10;
    const step = w / (points - 1);
    const amplitude = Math.min(Math.abs(change) * 0.5, 8);

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';

    for (let i = 0; i < points; i++) {
      const x = i * step;
      const progress = i / (points - 1);
      const noise = Math.sin(i * 1.8) * amplitude * 0.3;
      const trend = change >= 0
        ? mid + amplitude * (1 - progress) + noise - amplitude * 0.5
        : mid - amplitude * (1 - progress) + noise + amplitude * 0.5;
      const y = Math.max(1, Math.min(h - 1, trend));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  _skeletonCards(count) {
    let cards = '';
    for (let i = 0; i < count; i++) {
      const tw = 55 + Math.random() * 30;
      cards += `
        <div class="feed-card-skeleton">
          <div class="feed-skel-icon skeleton"></div>
          <div class="feed-skel-body">
            <div class="skeleton skel-title" style="width:${tw}%"></div>
            <div class="skeleton skel-meta"></div>
          </div>
        </div>
      `;
    }
    return cards;
  }

  _parseTags(raw) {
    if (!raw || raw === '[]') return [];
    try { return JSON.parse(raw); } catch { return []; }
  }

  _relativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  _fullTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

customElements.define('impact-feed', ImpactFeed);
