class PriceTable extends HTMLElement {
  constructor() {
    super();
    this._prevPrices = {};
  }

  connectedCallback() {
    this.innerHTML = `
      <table class="price-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Token</th>
            <th>Price (USD)</th>
            <th>24h Change</th>
            <th>Market Cap</th>
            <th>Volume (24h)</th>
          </tr>
        </thead>
        <tbody id="price-tbody">
          ${this._skeletonRows(8)}
        </tbody>
      </table>
    `;
  }

  update(prices) {
    const tbody = this.querySelector('#price-tbody');
    if (!prices.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="loading-state">No price data yet — updates every 5 minutes</td></tr>';
      return;
    }

    tbody.innerHTML = prices.map((p, i) => {
      const pct = p.price_change_percentage_24h ?? 0;
      const cls = pct >= 0 ? 'change-positive' : 'change-negative';
      const sign = pct >= 0 ? '+' : '';

      // Detect price change for flash effect
      const prev = this._prevPrices[p.symbol];
      let flashCls = '';
      if (prev !== undefined && prev !== p.price_usd) {
        flashCls = p.price_usd > prev ? 'price-flash-up' : 'price-flash-down';
      }

      return `
        <tr data-symbol="${this._esc(p.symbol)}" class="${flashCls}">
          <td>${i + 1}</td>
          <td><a href="/tokens/${encodeURIComponent(p.symbol.toUpperCase())}" class="token-link"><span class="token-symbol">${this._esc(p.symbol.toUpperCase())}</span><span class="token-name">${this._esc(p.name)}</span></a></td>
          <td>$${this._fmtPrice(p.price_usd)}</td>
          <td class="${cls}">${sign}${pct.toFixed(2)}%<canvas class="mini-sparkline" data-symbol="${this._esc(p.symbol)}" data-change="${pct}" width="40" height="16"></canvas></td>
          <td>$${this._fmtBig(p.market_cap)}</td>
          <td>$${this._fmtBig(p.total_volume)}</td>
        </tr>
      `;
    }).join('');

    // Store current prices for next comparison
    prices.forEach(p => { this._prevPrices[p.symbol] = p.price_usd; });

    // Draw mini sparklines
    this.querySelectorAll('.mini-sparkline').forEach(canvas => {
      this._drawSparkline(canvas, parseFloat(canvas.dataset.change));
    });

    tbody.querySelectorAll('tr[data-symbol]').forEach(row => {
      row.addEventListener('click', () => {
        const symbol = row.dataset.symbol;
        this.dispatchEvent(new CustomEvent('token-select', {
          bubbles: true,
          detail: { symbol }
        }));
      });
    });
  }

  _drawSparkline(canvas, change) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const color = change >= 0 ? '#3fb950' : '#f85149';
    const mid = h / 2;

    // Generate a simple trend line based on the change percentage
    const points = 8;
    const step = w / (points - 1);
    const amplitude = Math.min(Math.abs(change) * 0.5, 6);

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';

    for (let i = 0; i < points; i++) {
      const x = i * step;
      // Create a trend from left to right reflecting the direction
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
      const w1 = 20 + Math.random() * 30;
      const w2 = 40 + Math.random() * 30;
      rows += `
        <tr class="skeleton-row">
          <td><div class="skeleton skeleton-cell" style="width:20px"></div></td>
          <td><div class="skeleton skeleton-cell-lg" style="width:${w2}%"></div></td>
          <td><div class="skeleton skeleton-cell" style="width:70px"></div></td>
          <td><div class="skeleton skeleton-cell-sm" style="width:${w1}%"></div></td>
          <td><div class="skeleton skeleton-cell" style="width:60px"></div></td>
          <td><div class="skeleton skeleton-cell" style="width:60px"></div></td>
        </tr>
      `;
    }
    return rows;
  }

  _fmtPrice(n) {
    if (n == null) return '—';
    if (n >= 1) return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  }

  _fmtBig(n) {
    if (n == null) return '—';
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  _esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

customElements.define('price-table', PriceTable);
