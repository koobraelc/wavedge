class StatsRow extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="stats-row">
        <div class="stat-card stat-card-skeleton"><div class="label-skel skeleton"></div><div class="value-skel skeleton"></div></div>
        <div class="stat-card stat-card-skeleton"><div class="label-skel skeleton"></div><div class="value-skel skeleton"></div></div>
        <div class="stat-card stat-card-skeleton"><div class="label-skel skeleton"></div><div class="value-skel skeleton"></div></div>
        <div class="stat-card stat-card-skeleton"><div class="label-skel skeleton"></div><div class="value-skel skeleton"></div></div>
      </div>
    `;
  }

  update(prices, newsCount) {
    const row = this.querySelector('.stats-row');
    const t = window.i18n ? window.i18n.t : (k) => k;

    const btc = prices.find(p => p.symbol.toLowerCase() === 'btc');
    const eth = prices.find(p => p.symbol.toLowerCase() === 'eth');

    const totalMcap = prices.reduce((sum, p) => sum + (p.market_cap || 0), 0);
    const totalMcapPrev = prices.reduce((sum, p) => {
      const pct = p.price_change_percentage_24h || 0;
      const mc = p.market_cap || 0;
      return sum + (pct !== 0 ? mc / (1 + pct / 100) : mc);
    }, 0);
    const mcapChange = totalMcapPrev > 0 ? ((totalMcap - totalMcapPrev) / totalMcapPrev) * 100 : 0;

    row.innerHTML = `
      ${this._priceCard('BTC', btc)}
      ${this._priceCard('ETH', eth)}
      ${this._mcapCard(totalMcap, mcapChange)}
      <div class="stat-card stat-card-sentiment" id="sentiment-card">
        <div class="label">${t('stats.sentiment')} <info-tip text="${this._esc(t('stats.sentimentTip'))}"></info-tip></div>
        <div class="value" style="color: var(--text-muted)">...</div>
      </div>
    `;

    this._loadSentiment();
  }

  _priceCard(symbol, data) {
    const t = window.i18n ? window.i18n.t : (k) => k;
    if (!data) {
      return `
        <div class="stat-card">
          <div class="label">${this._esc(symbol)} ${t('stats.price')}</div>
          <div class="value">--</div>
        </div>
      `;
    }
    const price = this._formatPrice(data.current_price || data.price_usd || data.price || 0);
    const pct = data.price_change_percentage_24h ?? 0;
    const cls = pct >= 0 ? 'change-positive' : 'change-negative';
    const sign = pct >= 0 ? '+' : '';

    return `
      <div class="stat-card">
        <div class="label">${this._esc(symbol)} ${t('stats.price')}</div>
        <div class="value market-pulse-price">${price}</div>
        <div class="market-pulse-change ${cls}">${sign}${pct.toFixed(2)}% <info-tip text="${this._esc(t('stats.priceTip'))}"></info-tip> <span class="change-period">${t('stats.24h')}</span></div>
      </div>
    `;
  }

  _mcapCard(totalMcap, mcapChange) {
    const t = window.i18n ? window.i18n.t : (k) => k;
    const cls = mcapChange >= 0 ? 'change-positive' : 'change-negative';
    const sign = mcapChange >= 0 ? '+' : '';

    return `
      <div class="stat-card">
        <div class="label">${t('stats.marketCap')} <info-tip text="${this._esc(t('stats.marketCapTip'))}"></info-tip></div>
        <div class="value market-pulse-price">${this._formatMcap(totalMcap)}</div>
        <div class="market-pulse-change ${cls}">${sign}${mcapChange.toFixed(2)}% <span class="change-period">${t('stats.24h')}</span></div>
      </div>
    `;
  }

  async _loadSentiment() {
    const card = this.querySelector('#sentiment-card');
    if (!card) return;

    try {
      const res = await fetch('/api/homepage/sentiment');
      if (!res.ok) {
        this._renderSentimentFallback(card);
        return;
      }
      const { data } = await res.json();
      if (!data) {
        this._renderSentimentFallback(card);
        return;
      }

      const label = data.label || 'Neutral';
      const score = data.score ?? 50;
      let color = 'var(--text-secondary)';
      let pillCls = 'sentiment-neutral';

      if (data.bullish > data.bearish) {
        color = 'var(--green)';
        pillCls = 'sentiment-bullish';
      } else if (data.bearish > data.bullish) {
        color = 'var(--red)';
        pillCls = 'sentiment-bearish';
      }

      const t = window.i18n ? window.i18n.t : (k) => k;
      card.innerHTML = `
        <div class="label">${t('stats.sentiment')} <info-tip text="${this._esc(t('stats.sentimentTip'))}"></info-tip></div>
        <div class="value"><span class="sentiment-pill ${pillCls}">${this._esc(label)}</span></div>
        <div class="sentiment-bar">
          <div class="sentiment-bar-fill" style="width: ${Math.max(0, Math.min(100, score))}%; background: ${color}"></div>
        </div>
      `;
    } catch {
      this._renderSentimentFallback(card);
    }
  }

  _renderSentimentFallback(card) {
    const t = window.i18n ? window.i18n.t : (k) => k;
    card.innerHTML = `
      <div class="label">${t('stats.sentiment')} <info-tip text="${this._esc(t('stats.sentimentTip'))}"></info-tip></div>
      <div class="value"><span class="sentiment-pill sentiment-neutral">${t('stats.na')}</span></div>
    `;
  }

  _formatPrice(n) {
    if (n >= 1000) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (n >= 1) return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  }

  _formatMcap(n) {
    if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    return '$' + n.toLocaleString();
  }

  _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

customElements.define('stats-row', StatsRow);
