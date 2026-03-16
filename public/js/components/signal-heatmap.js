class SignalHeatmap extends HTMLElement {
  constructor() {
    super();
    this._tokens = [];
    this._newsSignals = new Map();
  }

  connectedCallback() {
    this.innerHTML = `
      <div class="signal-heatmap">
        <div class="signal-heatmap-header">
          <span class="pulse-dot"></span>
          <span class="signal-heatmap-title">Signal Heatmap</span>
        </div>
        <div class="signal-heatmap-grid" id="heatmap-grid"></div>
      </div>
    `;
  }

  /**
   * @param {Array} prices - array of price objects with symbol, market_cap, price_change_percentage_24h, current_price
   * @param {Map} newsSignals - Map<symbol, {count, articles}> from getNewsSignals()
   */
  update(prices, newsSignals) {
    this._tokens = (prices || [])
      .filter(p => p.market_cap > 0)
      .sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0))
      .slice(0, 30);
    this._newsSignals = newsSignals || new Map();

    this._render();
  }

  _render() {
    const grid = this.querySelector('#heatmap-grid');
    if (!grid) return;

    if (!this._tokens.length) {
      grid.innerHTML = '<div class="signal-heatmap-empty">No token data</div>';
      return;
    }

    const maxMcap = this._tokens[0].market_cap || 1;

    grid.innerHTML = this._tokens.map(token => {
      const symbol = token.symbol.toUpperCase();
      const pct = token.price_change_percentage_24h ?? 0;
      const mcapRatio = (token.market_cap || 0) / maxMcap;

      // Size class based on market cap ratio
      let sizeClass = 'hm-sm';
      if (mcapRatio > 0.5) sizeClass = 'hm-xl';
      else if (mcapRatio > 0.2) sizeClass = 'hm-lg';
      else if (mcapRatio > 0.05) sizeClass = 'hm-md';

      // Solid background color based on 24h change
      const bg = this._changeColor(pct);
      const sign = pct >= 0 ? '+' : '';

      // News signal data
      const signal = this._newsSignals.get(symbol) || this._newsSignals.get(symbol.toLowerCase());
      const isHot = signal && signal.count >= 2;

      // Signal badge with count + sentiment arrow
      let badgeHtml = '';
      if (signal && signal.count > 0) {
        const sentiment = this._dominantSentiment(signal.articles);
        const arrow = sentiment > 0 ? '\u2191' : sentiment < 0 ? '\u2193' : '';
        badgeHtml = `<span class="hm-signal-badge">${signal.count}${arrow ? '<span class="hm-sentiment">' + arrow + '</span>' : ''}</span>`;
      }

      // Price display for larger cells
      let priceHtml = '';
      if ((sizeClass === 'hm-xl' || sizeClass === 'hm-lg') && token.current_price) {
        priceHtml = `<span class="hm-price">${this._formatPrice(token.current_price)}</span>`;
      }

      return `
        <a href="/tokens/${encodeURIComponent(symbol)}" class="hm-cell ${sizeClass}${isHot ? ' hm-hot' : ''}" style="background: ${bg}" title="${this._esc(symbol)} ${sign}${pct.toFixed(1)}%${signal ? ' | ' + signal.count + ' articles (24h)' : ''}">
          <span class="hm-symbol">${this._esc(symbol)}</span>
          <span class="hm-pct">${sign}${pct.toFixed(1)}%</span>
          ${priceHtml}
          ${badgeHtml}
        </a>
      `;
    }).join('');
  }

  /**
   * Determine dominant sentiment from articles' impact scores.
   * Returns positive number for bullish, negative for bearish, 0 for neutral.
   */
  _dominantSentiment(articles) {
    let total = 0;
    let count = 0;
    for (const a of articles) {
      if (a._impact && a._impact.tokenImpacts) {
        for (const ti of a._impact.tokenImpacts) {
          if (ti.historical && ti.historical.avgChange24h != null) {
            total += ti.historical.avgChange24h;
            count++;
          }
        }
      }
    }
    if (count === 0) return 0;
    const avg = total / count;
    if (avg > 0.1) return 1;
    if (avg < -0.1) return -1;
    return 0;
  }

  _changeColor(pct) {
    const clamped = Math.max(-10, Math.min(10, pct));
    const intensity = Math.abs(clamped) / 10;

    if (clamped >= 0) {
      // Interpolate from dark neutral green to bright green
      const r = Math.round(13 + (20 - 13) * (1 - intensity));
      const g = Math.round(94 * 0.6 + 94 * 0.4 * intensity);
      const b = Math.round(46 * 0.6 + 46 * 0.4 * (1 - intensity));
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Interpolate from dark neutral red to bright red
      const r = Math.round(125 * 0.6 + 125 * 0.4 * intensity);
      const g = Math.round(26 + (26 - 26) * (1 - intensity));
      const b = Math.round(26 + (26 - 26) * (1 - intensity));
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  _formatPrice(n) {
    if (n >= 1000) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (n >= 1) return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }

  _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

customElements.define('signal-heatmap', SignalHeatmap);
