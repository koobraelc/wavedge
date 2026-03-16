class SignalDetailPanel extends HTMLElement {
  constructor() {
    super();
    this._open = false;
    this._symbol = null;
    this._data = {};
  }

  connectedCallback() {
    this.innerHTML = `<div class="sdp-card" id="sdp-card"></div>`;
  }

  open(symbol, data) {
    // Toggle off if clicking the same token
    if (this._open && this._symbol === symbol.toUpperCase()) {
      this.close();
      return;
    }

    this._symbol = symbol.toUpperCase();
    this._data = data || {};
    this._open = true;

    this._render();

    const card = this.querySelector('#sdp-card');
    if (card) {
      card.classList.add('sdp-visible');
      // Smooth scroll into view
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  close() {
    this._open = false;
    this._symbol = null;
    const card = this.querySelector('#sdp-card');
    if (card) {
      card.classList.remove('sdp-visible');
      card.innerHTML = '';
    }
  }

  _render() {
    const card = this.querySelector('#sdp-card');
    if (!card) return;
    const t = this._t();
    const priceData = this._data.price || {};
    const pct = priceData.price_change_percentage_24h ?? 0;
    const sign = pct >= 0 ? '+' : '';
    const pctClass = pct >= 0 ? 'sdp-green' : 'sdp-red';
    const price = priceData.current_price || priceData.price_usd;
    const mcap = priceData.market_cap;

    // Signal pills
    const news = this._data.newsSignal;
    const social = this._data.socialSentiment;
    const whale = this._data.whaleActivity;

    let pills = '';
    if (news && news.count > 0) {
      pills += `<span class="sdp-pill sdp-pill-active">📰 ${news.count} article${news.count > 1 ? 's' : ''}</span>`;
    }
    if (social && social.mentionCount > 0) {
      const label = social.sentimentLabel || 'neutral';
      const cls = label === 'bullish' ? 'sdp-pill-bull' : label === 'bearish' ? 'sdp-pill-bear' : 'sdp-pill-active';
      pills += `<span class="sdp-pill ${cls}">💬 ${this._capitalize(label)}</span>`;
    }
    if (whale && whale.transactionCount > 0) {
      pills += `<span class="sdp-pill sdp-pill-active">🐋 ${whale.transactionCount} tx · ${this._formatUsd(whale.totalUsd)}</span>`;
    }

    // Price pill (always shown)
    const priceClass = pct >= 0 ? 'sdp-pill-bull' : 'sdp-pill-bear';
    pills += `<span class="sdp-pill ${priceClass}">📈 ${sign}${pct.toFixed(1)}% (24h)</span>`;

    // Recent news headlines (max 3)
    let newsHtml = '';
    if (news && news.articles && news.articles.length > 0) {
      const items = news.articles.slice(0, 3).map(a => {
        const title = this._esc(a.title || 'Untitled');
        const source = this._esc(a.source || '');
        const timeAgo = this._timeAgo(a.published_at);
        return `<div class="sdp-card-news-item">
          <a href="${this._esc(a.url || '#')}" target="_blank" rel="noopener">${title}</a>
          <span class="sdp-card-news-meta">${source}${source && timeAgo ? ' · ' : ''}${timeAgo}</span>
        </div>`;
      }).join('');
      newsHtml = `<div class="sdp-card-news">${items}</div>`;
    }

    card.innerHTML = `
      <div class="sdp-card-inner">
        <div class="sdp-card-header">
          <div class="sdp-card-title">
            <span class="sdp-card-symbol">${this._esc(this._symbol)}</span>
            ${price ? `<span class="sdp-card-price">${this._formatPrice(price)}</span>` : ''}
            <span class="sdp-card-pct ${pctClass}">${sign}${pct.toFixed(2)}%</span>
            ${mcap ? `<span class="sdp-card-mcap">${t('MCap')}: ${this._formatUsd(mcap)}</span>` : ''}
          </div>
          <button class="sdp-card-close" aria-label="Close">&times;</button>
        </div>
        <div class="sdp-card-pills">${pills}</div>
        ${newsHtml}
        <div class="sdp-card-actions">
          <a href="/settings/alerts?token=${encodeURIComponent(this._symbol)}" class="sdp-card-btn sdp-card-btn-secondary">${t('Set Alert')}</a>
          <a href="/tokens/${encodeURIComponent(this._symbol)}" class="sdp-card-btn sdp-card-btn-primary">${t('Full Analysis')} →</a>
        </div>
      </div>
    `;

    card.querySelector('.sdp-card-close').addEventListener('click', () => this.close());
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

  _capitalize(s) {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  _formatPrice(n) {
    if (n >= 1000) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (n >= 1) return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }

  _formatUsd(n) {
    if (!n) return '$0';
    if (n >= 1e12) return '$' + (n / 1e12).toFixed(1) + 'T';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n.toFixed(0);
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
