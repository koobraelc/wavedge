class SignalHeatmap extends HTMLElement {
  constructor() {
    super();
    this._tokens = [];
    this._hotSymbols = new Set();
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
   * @param {Array} prices - array of price objects with symbol, market_cap, price_change_percentage_24h
   * @param {Set} hotSymbols - symbols with 2+ news articles in last 6h
   */
  update(prices, hotSymbols) {
    this._tokens = (prices || [])
      .filter(p => p.market_cap > 0)
      .sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0))
      .slice(0, 30);
    this._hotSymbols = hotSymbols || new Set();

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

      // Color based on 24h change
      const bg = this._changeColor(pct);
      const isHot = this._hotSymbols.has(symbol) || this._hotSymbols.has(symbol.toLowerCase());
      const sign = pct >= 0 ? '+' : '';

      return `
        <a href="/tokens/${encodeURIComponent(symbol)}" class="hm-cell ${sizeClass}${isHot ? ' hm-hot' : ''}" style="background: ${bg}" title="${this._esc(symbol)} ${sign}${pct.toFixed(1)}%">
          <span class="hm-symbol">${this._esc(symbol)}</span>
          <span class="hm-pct">${sign}${pct.toFixed(1)}%</span>
          ${isHot ? '<span class="hm-pulse"></span>' : ''}
        </a>
      `;
    }).join('');
  }

  _changeColor(pct) {
    const clamped = Math.max(-10, Math.min(10, pct));
    const intensity = Math.abs(clamped) / 10;

    if (clamped >= 0) {
      const alpha = 0.1 + intensity * 0.4;
      return `rgba(63, 185, 80, ${alpha.toFixed(2)})`;
    } else {
      const alpha = 0.1 + intensity * 0.4;
      return `rgba(248, 81, 73, ${alpha.toFixed(2)})`;
    }
  }

  _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

customElements.define('signal-heatmap', SignalHeatmap);
