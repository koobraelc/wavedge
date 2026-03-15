class PriceTable extends HTMLElement {
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
          <tr><td colspan="6" class="loading-state"><span class="spinner"></span>Loading prices...</td></tr>
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
      return `
        <tr data-symbol="${this._esc(p.symbol)}">
          <td>${i + 1}</td>
          <td><span class="token-symbol">${this._esc(p.symbol.toUpperCase())}</span><span class="token-name">${this._esc(p.name)}</span></td>
          <td>$${this._fmtPrice(p.price_usd)}</td>
          <td class="${cls}">${sign}${pct.toFixed(2)}%</td>
          <td>$${this._fmtBig(p.market_cap)}</td>
          <td>$${this._fmtBig(p.total_volume)}</td>
        </tr>
      `;
    }).join('');

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
