class WatchlistWidget extends HTMLElement {
  constructor() {
    super();
    this._tokens = [];
    this._isPersonalized = false;
  }

  connectedCallback() {
    const t = window.i18n ? window.i18n.t : (k) => k;
    this.innerHTML = `
      <div class="wl-widget">
        <div class="wl-header">
          <span class="wl-title">${t('watchlist.topTokens')}</span>
        </div>
        <div class="wl-body" id="wl-body">
          ${this._skeletonRows(4)}
        </div>
      </div>
    `;
    this._loadData();
  }

  refresh() {
    this._loadData();
  }

  async _loadData() {
    try {
      const headers = {};
      const token = localStorage.getItem('auth_token');
      if (token) headers['Authorization'] = 'Bearer ' + token;

      const res = await fetch('/api/homepage/watchlist', { headers });
      if (!res.ok) throw new Error('API ' + res.status);
      const { data } = await res.json();
      this._tokens = (data.tokens || []).slice(0, 8);
      this._isPersonalized = !!token && this._tokens.length > 0;
      this._render();
    } catch (err) {
      console.error('[WatchlistWidget] Load failed:', err);
      this._renderError();
    }
  }

  _render() {
    const t = window.i18n ? window.i18n.t : (k) => k;
    const title = this.querySelector('.wl-title');
    if (title) title.textContent = this._isPersonalized ? t('watchlist.yourWatchlist') : t('watchlist.topTokens');

    const body = this.querySelector('#wl-body');
    if (!body) return;

    if (!this._tokens.length) {
      const t = window.i18n ? window.i18n.t : (k) => k;
      body.innerHTML = `<div class="wl-empty">
        <p>${t('watchlist.emptyTitle')}</p>
        <a href="/settings/alerts" class="wl-empty-link">${t('watchlist.emptyAction')}</a>
      </div>`;
      return;
    }

    body.innerHTML = `
      <table class="wl-table">
        <thead>
          <tr>
            <th class="wl-th-token">${t('watchlist.token')}</th>
            <th class="wl-th-price">${t('watchlist.price')}</th>
            <th class="wl-th-change">${t('watchlist.change24h')}</th>
            <th class="wl-th-signals">${t('watchlist.signals')} <info-tip text="${this._esc(t('watchlist.signalsTip'))}"></info-tip></th>
            <th class="wl-th-chart"></th>
          </tr>
        </thead>
        <tbody>
          ${this._tokens.map(t => this._renderRow(t)).join('')}
        </tbody>
      </table>
      <div class="wl-cards">
        ${this._tokens.map(t => this._renderCard(t)).join('')}
      </div>
    `;

    // Draw sparklines after DOM update
    requestAnimationFrame(() => {
      body.querySelectorAll('.wl-sparkline').forEach(canvas => {
        const change = parseFloat(canvas.dataset.change);
        this._drawSparkline(canvas, change);
      });
    });
  }

  _renderRow(token) {
    const symbol = this._esc(token.symbol.toUpperCase());
    const name = this._esc(token.name || token.symbol);
    const price = this._formatPrice(token.price);
    const pct = token.change_24h ?? 0;
    const sign = pct >= 0 ? '+' : '';
    const cls = pct >= 0 ? 'wl-up' : 'wl-down';
    const newsCount = token.news_count_24h || 0;

    return `
      <tr class="wl-row">
        <td class="wl-cell-token">
          <a href="/tokens/${encodeURIComponent(token.symbol.toUpperCase())}">
            <span class="wl-symbol">${symbol}</span>
            <span class="wl-name">${name}</span>
          </a>
        </td>
        <td class="wl-cell-price">${price}</td>
        <td class="wl-cell-change ${cls}">${sign}${pct.toFixed(1)}%</td>
        <td class="wl-cell-signals">${newsCount > 0 ? '<span class="wl-badge">' + newsCount + '</span>' : '<span class="wl-badge-empty">0</span>'}</td>
        <td class="wl-cell-chart">
          <canvas class="wl-sparkline" data-change="${pct}" width="48" height="24"></canvas>
        </td>
      </tr>
    `;
  }

  _renderCard(token) {
    const symbol = this._esc(token.symbol.toUpperCase());
    const name = this._esc(token.name || token.symbol);
    const price = this._formatPrice(token.price);
    const pct = token.change_24h ?? 0;
    const sign = pct >= 0 ? '+' : '';
    const cls = pct >= 0 ? 'wl-up' : 'wl-down';
    const newsCount = token.news_count_24h || 0;

    return `
      <a href="/tokens/${encodeURIComponent(token.symbol.toUpperCase())}" class="wl-card">
        <span class="wl-card-symbol">${symbol}</span>
        <span class="wl-card-name">${name}</span>
        <span class="wl-card-price">${price}</span>
        <div class="wl-card-bottom">
          <span class="wl-card-change ${cls}">${sign}${pct.toFixed(1)}%</span>
          ${newsCount > 0 ? '<span class="wl-badge">' + newsCount + '</span>' : ''}
        </div>
      </a>
    `;
  }

  _renderError() {
    const t = window.i18n ? window.i18n.t : (k) => k;
    const body = this.querySelector('#wl-body');
    if (body) body.innerHTML = `<div class="wl-empty">${t('watchlist.loadFailed')}</div>`;
  }

  _formatPrice(n) {
    if (n == null) return '—';
    if (n >= 1000) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (n >= 1) return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
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

  _skeletonRows(count) {
    let rows = '';
    for (let i = 0; i < count; i++) {
      rows += `
        <div class="wl-skel-row">
          <div class="skeleton wl-skel-token"></div>
          <div class="skeleton wl-skel-price"></div>
          <div class="skeleton wl-skel-change"></div>
        </div>
      `;
    }
    return rows;
  }

  _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

customElements.define('watchlist-widget', WatchlistWidget);
