class SignalDetailPanel extends HTMLElement {
  constructor() {
    super();
    this._open = false;
    this._symbol = null;
    this._data = {};
    this._onBackdropClick = this._onBackdropClick.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  connectedCallback() {
    this.innerHTML = `
      <div class="sdp-backdrop" id="sdp-backdrop"></div>
      <div class="sdp-panel" id="sdp-panel">
        <div class="sdp-content" id="sdp-content"></div>
      </div>
    `;
    this.querySelector('#sdp-backdrop').addEventListener('click', this._onBackdropClick);
  }

  async open(symbol, data) {
    this._symbol = symbol.toUpperCase();
    this._data = data || {};
    this._open = true;

    const panel = this.querySelector('#sdp-panel');
    const backdrop = this.querySelector('#sdp-backdrop');
    if (!panel || !backdrop) return;

    this._renderLoading();
    backdrop.classList.add('sdp-visible');
    panel.classList.add('sdp-visible');
    document.addEventListener('keydown', this._onKeyDown);
    document.body.style.overflow = 'hidden';

    // Lazy-load additional data
    const [sentiment, impact] = await Promise.allSettled([
      this._loadSentiment(this._symbol),
      this._loadImpact(this._symbol)
    ]);

    if (sentiment.status === 'fulfilled') this._data.sentiment = sentiment.value;
    if (impact.status === 'fulfilled') this._data.impact = impact.value;

    this._renderFull();
  }

  close() {
    this._open = false;
    const panel = this.querySelector('#sdp-panel');
    const backdrop = this.querySelector('#sdp-backdrop');
    if (panel) panel.classList.remove('sdp-visible');
    if (backdrop) backdrop.classList.remove('sdp-visible');
    document.removeEventListener('keydown', this._onKeyDown);
    document.body.style.overflow = '';
  }

  _onBackdropClick() { this.close(); }

  _onKeyDown(e) {
    if (e.key === 'Escape') this.close();
  }

  _renderLoading() {
    const content = this.querySelector('#sdp-content');
    if (!content) return;
    const t = this._t();
    const priceData = this._data.price || {};
    const pct = priceData.price_change_percentage_24h ?? 0;
    const sign = pct >= 0 ? '+' : '';
    const pctClass = pct >= 0 ? 'sdp-green' : 'sdp-red';
    const price = priceData.current_price || priceData.price_usd;

    content.innerHTML = `
      <div class="sdp-header">
        <div class="sdp-header-left">
          <span class="sdp-symbol">${this._esc(this._symbol)}</span>
          ${price ? `<span class="sdp-price">${this._formatPrice(price)}</span>` : ''}
          <span class="sdp-pct ${pctClass}">${sign}${pct.toFixed(2)}%</span>
        </div>
        <div class="sdp-header-right">
          <a href="/tokens/${encodeURIComponent(this._symbol)}" class="sdp-link">${t('Full Analysis')} &rarr;</a>
          <button class="sdp-close" id="sdp-close">&times;</button>
        </div>
      </div>
      <div class="sdp-body">
        <div class="sdp-loading">Loading signal data&hellip;</div>
      </div>
    `;
    this.querySelector('#sdp-close').addEventListener('click', () => this.close());
  }

  _renderFull() {
    const content = this.querySelector('#sdp-content');
    if (!content) return;
    const t = this._t();
    const priceData = this._data.price || {};
    const pct = priceData.price_change_percentage_24h ?? 0;
    const sign = pct >= 0 ? '+' : '';
    const pctClass = pct >= 0 ? 'sdp-green' : 'sdp-red';
    const price = priceData.current_price || priceData.price_usd;

    content.innerHTML = `
      <div class="sdp-header">
        <div class="sdp-header-left">
          <span class="sdp-symbol">${this._esc(this._symbol)}</span>
          ${price ? `<span class="sdp-price">${this._formatPrice(price)}</span>` : ''}
          <span class="sdp-pct ${pctClass}">${sign}${pct.toFixed(2)}%</span>
        </div>
        <div class="sdp-header-right">
          <a href="/tokens/${encodeURIComponent(this._symbol)}" class="sdp-link">${t('Full Analysis')} &rarr;</a>
          <button class="sdp-close" id="sdp-close">&times;</button>
        </div>
      </div>
      ${this._renderSignalSummary()}
      <div class="sdp-body">
        ${this._renderNewsSection()}
        ${this._renderSocialSection()}
        ${this._renderWhaleSection()}
        ${this._renderImpactSection()}
      </div>
      <div class="sdp-actions">
        <a href="/settings/alerts?token=${encodeURIComponent(this._symbol)}" class="btn btn-secondary btn-sm">${t('Set Alert')}</a>
        <a href="/tokens/${encodeURIComponent(this._symbol)}" class="btn btn-primary btn-sm">${t('Full Analysis')}</a>
      </div>
    `;
    this.querySelector('#sdp-close').addEventListener('click', () => this.close());

    // Collapsible sections
    content.querySelectorAll('.sdp-section-header').forEach(header => {
      header.addEventListener('click', () => {
        const section = header.parentElement;
        section.classList.toggle('sdp-collapsed');
      });
    });
  }

  _renderSignalSummary() {
    const news = this._data.newsSignal;
    const social = this._data.socialSentiment;
    const whale = this._data.whaleActivity;
    const priceData = this._data.price || {};
    const pct = priceData.price_change_percentage_24h ?? 0;

    let pills = '';

    // News pill
    if (news && news.count > 0) {
      const cls = news.count >= 3 ? 'sdp-pill-hot' : 'sdp-pill-active';
      pills += `<span class="sdp-pill ${cls}">📰 ${news.count} article${news.count > 1 ? 's' : ''}</span>`;
    } else {
      pills += `<span class="sdp-pill sdp-pill-inactive">📰 No news</span>`;
    }

    // Social pill
    if (social && social.mentionCount > 0) {
      const label = social.sentimentLabel || 'neutral';
      const cls = label === 'bullish' ? 'sdp-pill-bull' : label === 'bearish' ? 'sdp-pill-bear' : 'sdp-pill-active';
      pills += `<span class="sdp-pill ${cls}">💬 ${this._capitalize(label)} · ${social.mentionCount} mentions</span>`;
    } else {
      pills += `<span class="sdp-pill sdp-pill-inactive">💬 No social data</span>`;
    }

    // Whale pill
    if (whale && whale.transactionCount > 0) {
      pills += `<span class="sdp-pill sdp-pill-active">🐋 ${whale.transactionCount} tx · ${this._formatUsd(whale.totalUsd)}</span>`;
    }

    // Price pill
    const priceClass = pct >= 0 ? 'sdp-pill-bull' : 'sdp-pill-bear';
    pills += `<span class="sdp-pill ${priceClass}">📈 ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% (24h)</span>`;

    return `<div class="sdp-signal-bar">${pills}</div>`;
  }

  _renderNewsSection() {
    const news = this._data.newsSignal;
    if (!news || !news.articles || news.articles.length === 0) {
      return `
        <div class="sdp-section">
          <div class="sdp-section-header"><span>📰 News</span><span class="sdp-chevron">▾</span></div>
          <div class="sdp-section-body"><p class="sdp-empty">No recent news articles for ${this._esc(this._symbol)}.</p></div>
        </div>`;
    }

    const articles = news.articles.slice(0, 5);
    const rows = articles.map(a => {
      const timeAgo = this._timeAgo(a.published_at);
      const source = this._esc(a.source || 'Unknown');
      const title = this._esc(a.title || 'Untitled');

      let impactHtml = '';
      if (a._impact && a._impact.tokenImpacts) {
        const ti = a._impact.tokenImpacts.find(t => t.symbol && t.symbol.toUpperCase() === this._symbol);
        if (ti && ti.historical && ti.historical.avgChange24h != null) {
          const avg = ti.historical.avgChange24h;
          const cls = avg >= 0 ? 'sdp-green' : 'sdp-red';
          impactHtml = `<span class="sdp-impact ${cls}">${avg >= 0 ? '+' : ''}${avg.toFixed(2)}% avg</span>`;
        }
      }

      return `
        <div class="sdp-news-item">
          <a href="${this._esc(a.url || '#')}" target="_blank" rel="noopener" class="sdp-news-title">${title}</a>
          <div class="sdp-news-meta">
            <span>${source}</span>
            <span>${timeAgo}</span>
            ${impactHtml}
          </div>
        </div>`;
    }).join('');

    const moreLink = news.articles.length > 5
      ? `<a href="/tokens/${encodeURIComponent(this._symbol)}" class="sdp-more">View all ${news.articles.length} articles &rarr;</a>`
      : '';

    return `
      <div class="sdp-section">
        <div class="sdp-section-header"><span>📰 News (${news.count})</span><span class="sdp-chevron">▾</span></div>
        <div class="sdp-section-body">${rows}${moreLink}</div>
      </div>`;
  }

  _renderSocialSection() {
    const social = this._data.socialSentiment;
    const detail = this._data.sentiment;

    if (!social && !detail) {
      return `
        <div class="sdp-section sdp-collapsed">
          <div class="sdp-section-header"><span>💬 Social Sentiment</span><span class="sdp-chevron">▾</span></div>
          <div class="sdp-section-body"><p class="sdp-empty">No social data available.</p></div>
        </div>`;
    }

    const label = (social && social.sentimentLabel) || (detail && detail.sentimentLabel) || 'neutral';
    const score = (social && social.sentimentScore) || (detail && detail.sentimentScore) || 0;
    const mentions = (social && social.mentionCount) || (detail && detail.mentionCount) || 0;
    const cls = label === 'bullish' ? 'sdp-green' : label === 'bearish' ? 'sdp-red' : 'sdp-muted';

    // Sentiment gauge bar
    const gaugePercent = Math.round(((score + 1) / 2) * 100); // -1..1 → 0..100
    const gaugeColor = label === 'bullish' ? 'var(--green)' : label === 'bearish' ? 'var(--red)' : 'var(--text-muted)';

    let samplesHtml = '';
    if (detail && detail.sampleTexts && detail.sampleTexts.length > 0) {
      samplesHtml = `<div class="sdp-samples">${detail.sampleTexts.slice(0, 3).map(t =>
        `<div class="sdp-sample">"${this._esc(this._truncate(t, 120))}"</div>`
      ).join('')}</div>`;
    }

    return `
      <div class="sdp-section${!social ? ' sdp-collapsed' : ''}">
        <div class="sdp-section-header"><span>💬 Social Sentiment</span><span class="sdp-chevron">▾</span></div>
        <div class="sdp-section-body">
          <div class="sdp-sentiment-row">
            <span class="sdp-sentiment-label ${cls}">${this._capitalize(label)}</span>
            <span class="sdp-sentiment-score">Score: ${score.toFixed(2)}</span>
            <span class="sdp-sentiment-mentions">${mentions} mentions</span>
          </div>
          <div class="sdp-gauge">
            <div class="sdp-gauge-fill" style="width: ${gaugePercent}%; background: ${gaugeColor}"></div>
          </div>
          <div class="sdp-gauge-labels"><span>Bearish</span><span>Bullish</span></div>
          ${samplesHtml}
        </div>
      </div>`;
  }

  _renderWhaleSection() {
    const whale = this._data.whaleActivity;
    if (!whale || whale.transactionCount === 0) {
      return `
        <div class="sdp-section sdp-collapsed">
          <div class="sdp-section-header"><span>🐋 Whale Activity</span><span class="sdp-chevron">▾</span></div>
          <div class="sdp-section-body"><p class="sdp-empty">No whale activity detected.</p></div>
        </div>`;
    }

    return `
      <div class="sdp-section">
        <div class="sdp-section-header"><span>🐋 Whale Activity</span><span class="sdp-chevron">▾</span></div>
        <div class="sdp-section-body">
          <div class="sdp-whale-stats">
            <div class="sdp-stat">
              <span class="sdp-stat-value">${whale.transactionCount}</span>
              <span class="sdp-stat-label">Transactions</span>
            </div>
            <div class="sdp-stat">
              <span class="sdp-stat-value">${this._formatUsd(whale.totalUsd)}</span>
              <span class="sdp-stat-label">Total Volume</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  _renderImpactSection() {
    const impact = this._data.impact;
    if (!impact || !impact.categories || impact.categories.length === 0) {
      return `
        <div class="sdp-section sdp-collapsed">
          <div class="sdp-section-header"><span>📊 Historical Impact</span><span class="sdp-chevron">▾</span></div>
          <div class="sdp-section-body"><p class="sdp-empty">No historical impact data available.</p></div>
        </div>`;
    }

    const rows = impact.categories.map(cat => {
      const avg = cat.avgChange24h ?? 0;
      const cls = avg >= 0 ? 'sdp-green' : 'sdp-red';
      return `
        <tr>
          <td>${this._esc(cat.category)}</td>
          <td class="${cls}">${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%</td>
          <td>${cat.sampleSize || 0}</td>
        </tr>`;
    }).join('');

    return `
      <div class="sdp-section">
        <div class="sdp-section-header"><span>📊 Historical Impact</span><span class="sdp-chevron">▾</span></div>
        <div class="sdp-section-body">
          <table class="sdp-impact-table">
            <thead><tr><th>Category</th><th>Avg 24h</th><th>Samples</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  // --- Data loaders ---
  async _loadSentiment(symbol) {
    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(symbol)}/sentiment`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data || null;
    } catch { return null; }
  }

  async _loadImpact(symbol) {
    try {
      const res = await fetch(`/api/tokens/${encodeURIComponent(symbol)}/impact`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data || null;
    } catch { return null; }
  }

  // --- Utilities ---
  _t() {
    return window.i18n ? window.i18n.t : (k) => k;
  }

  _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  _formatPrice(n) {
    if (n >= 1000) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (n >= 1) return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }

  _formatUsd(n) {
    if (!n) return '$0';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n.toFixed(0);
  }

  _capitalize(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  _truncate(s, max) {
    if (!s || s.length <= max) return s;
    return s.slice(0, max) + '…';
  }

  _timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    return days + 'd ago';
  }
}

customElements.define('signal-detail-panel', SignalDetailPanel);
