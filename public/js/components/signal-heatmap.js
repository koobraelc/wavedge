class SignalHeatmap extends HTMLElement {
  constructor() {
    super();
    this._tokens = [];
    this._newsSignals = new Map();
    this._socialSentiment = new Map();
    this._whaleActivity = new Map();
  }

  connectedCallback() {
    const t = window.i18n ? window.i18n.t : (k) => k;

    this.innerHTML = `
      <div class="signal-heatmap">
        <div class="signal-heatmap-header">
          <span class="pulse-dot"></span>
          <span class="signal-heatmap-title">${t('heatmap.title')} <info-tip text="${t('heatmap.tip')}"></info-tip></span>
        </div>
        <div class="signal-heatmap-legend">
          <span class="hm-legend-item"><span class="hm-legend-swatch hm-legend-up"></span>${t('heatmap.legendUp')}</span>
          <span class="hm-legend-sep">&harr;</span>
          <span class="hm-legend-item"><span class="hm-legend-swatch hm-legend-down"></span>${t('heatmap.legendDown')}</span>
          <span class="hm-legend-divider"></span>
          <span class="hm-legend-item">${t('heatmap.legendSize')} <info-tip text="${t('heatmap.legendSizeTip')}"></info-tip></span>
          <span class="hm-legend-divider"></span>
          <span class="hm-legend-item">📰 ${t('heatmap.legendNews')} <info-tip text="${t('heatmap.legendNewsTip')}"></info-tip></span>
          <span class="hm-legend-item">💬 ${t('heatmap.legendSocial')} <info-tip text="${t('heatmap.legendSocialTip')}"></info-tip></span>
          <span class="hm-legend-item">🐋 ${t('heatmap.legendWhale')} <info-tip text="${t('heatmap.legendWhaleTip')}"></info-tip></span>
        </div>
        <div class="signal-heatmap-grid" id="heatmap-grid" role="grid" aria-label="${t('heatmap.title')}"></div>
      </div>
    `;
  }

  /**
   * @param {Array} prices - array of price objects with symbol, market_cap, price_change_percentage_24h, current_price
   * @param {Map} newsSignals - Map<symbol, {count, articles}> from getNewsSignals()
   * @param {Map} socialSentiment - Map<symbol, {mentionCount, sentimentScore, sentimentLabel}> (optional)
   * @param {Map} whaleActivity - Map<symbol, {transactionCount, totalUsd}> (optional)
   */
  update(prices, newsSignals, socialSentiment, whaleActivity) {
    this._tokens = (prices || [])
      .filter(p => p.market_cap > 0)
      .sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0))
      .slice(0, 50);
    this._newsSignals = newsSignals || new Map();
    this._socialSentiment = socialSentiment || new Map();
    this._whaleActivity = whaleActivity || new Map();

    this._render();
  }

  _render() {
    const grid = this.querySelector('#heatmap-grid');
    if (!grid) return;
    const t = window.i18n ? window.i18n.t : (k) => k;

    if (!this._tokens.length) {
      grid.innerHTML = `<div class="signal-heatmap-empty">${t('heatmap.noData')}</div>`;
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

      // Social sentiment badge
      const social = this._socialSentiment.get(symbol) || this._socialSentiment.get(symbol.toLowerCase());
      let sentimentBadgeHtml = '';
      if (social && social.mentionCount > 0) {
        const label = social.sentimentLabel || 'neutral';
        const sentClass = label === 'bullish' ? 'hm-sent-bull' : label === 'bearish' ? 'hm-sent-bear' : 'hm-sent-neutral';
        const icon = label === 'bullish' ? '\u{1F4C8}' : label === 'bearish' ? '\u{1F4C9}' : '\u{1F4CA}';
        sentimentBadgeHtml = `<span class="hm-sentiment-badge ${sentClass}" title="Social: ${social.mentionCount} mentions, ${label}">${icon}</span>`;
      }

      // Whale activity badge
      const whale = this._whaleActivity.get(symbol) || this._whaleActivity.get(symbol.toLowerCase());
      let whaleBadgeHtml = '';
      if (whale && whale.transactionCount > 0) {
        const usdFormatted = whale.totalUsd >= 1e9 ? '$' + (whale.totalUsd / 1e9).toFixed(1) + 'B'
          : whale.totalUsd >= 1e6 ? '$' + (whale.totalUsd / 1e6).toFixed(1) + 'M'
          : '$' + (whale.totalUsd / 1e3).toFixed(0) + 'K';
        whaleBadgeHtml = `<span class="hm-whale-badge" title="${t('heatmap.whale', { count: whale.transactionCount })}, ${usdFormatted}">\u{1F433}</span>`;
      }

      // Price display for larger cells
      let priceHtml = '';
      const tokenPrice = token.current_price || token.price_usd;
      if ((sizeClass === 'hm-xl' || sizeClass === 'hm-lg') && tokenPrice) {
        priceHtml = `<span class="hm-price">${this._formatPrice(tokenPrice)}</span>`;
      }

      // Build tooltip
      const tooltipParts = [`${this._esc(symbol)} ${sign}${pct.toFixed(1)}%`];
      if (signal) tooltipParts.push(t('heatmap.articles24h', { count: signal.count }));
      if (social) tooltipParts.push(t('heatmap.sentiment', { label: social.sentimentLabel || 'neutral' }));
      if (whale && whale.transactionCount > 0) tooltipParts.push(t('heatmap.whale', { count: whale.transactionCount }));
      const tooltip = tooltipParts.join(' | ');

      return `
        <div class="hm-cell ${sizeClass}${isHot ? ' hm-hot' : ''}" style="background: ${bg}" title="${tooltip}"
             data-symbol="${this._esc(symbol)}" data-href="/tokens/${encodeURIComponent(symbol)}" role="button" tabindex="0" aria-label="${tooltip}">
          <span class="hm-symbol">${this._esc(symbol)}</span>
          <span class="hm-pct">${sign}${pct.toFixed(1)}%</span>
          ${priceHtml}
          <span class="hm-badges">${badgeHtml}${sentimentBadgeHtml}${whaleBadgeHtml}</span>
        </div>
      `;
    }).join('');

    // Bind click handlers: left-click opens detail panel, cmd/ctrl+click navigates
    grid.querySelectorAll('.hm-cell[data-symbol]').forEach(cell => {
      cell.addEventListener('click', (e) => {
        const sym = cell.dataset.symbol;
        if (e.metaKey || e.ctrlKey) {
          window.open(cell.dataset.href, '_blank');
          return;
        }
        this.dispatchEvent(new CustomEvent('signal-detail-open', {
          bubbles: true,
          detail: {
            symbol: sym,
            price: this._tokens.find(t => t.symbol.toUpperCase() === sym),
            newsSignal: this._newsSignals.get(sym) || this._newsSignals.get(sym.toLowerCase()),
            socialSentiment: this._socialSentiment.get(sym) || this._socialSentiment.get(sym.toLowerCase()),
            whaleActivity: this._whaleActivity.get(sym) || this._whaleActivity.get(sym.toLowerCase()),
          }
        }));
      });
      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          cell.click();
        }
      });
    });
  }

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
      const r = Math.round(13 + (20 - 13) * (1 - intensity));
      const g = Math.round(94 * 0.6 + 94 * 0.4 * intensity);
      const b = Math.round(46 * 0.6 + 46 * 0.4 * (1 - intensity));
      return `rgb(${r}, ${g}, ${b})`;
    } else {
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
