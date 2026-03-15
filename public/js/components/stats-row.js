class StatsRow extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="stats-row">
        <div class="stat-card"><div class="label">Tokens Tracked</div><div class="value" id="stat-tokens">—</div></div>
        <div class="stat-card"><div class="label">Latest News</div><div class="value" id="stat-news">—</div></div>
        <div class="stat-card"><div class="label">Top Gainer (24h)</div><div class="value" id="stat-gainer">—</div></div>
        <div class="stat-card"><div class="label">Top Loser (24h)</div><div class="value" id="stat-loser">—</div></div>
      </div>
    `;
  }

  update(prices, newsCount) {
    this.querySelector('#stat-tokens').textContent = prices.length;
    this.querySelector('#stat-news').textContent = newsCount;

    if (prices.length > 0) {
      const sorted = [...prices].sort((a, b) =>
        (b.price_change_percentage_24h ?? 0) - (a.price_change_percentage_24h ?? 0)
      );
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];

      const gainerEl = this.querySelector('#stat-gainer');
      gainerEl.textContent = `${best.symbol.toUpperCase()} ${(best.price_change_percentage_24h ?? 0).toFixed(1)}%`;
      gainerEl.style.color = 'var(--green)';

      const loserEl = this.querySelector('#stat-loser');
      loserEl.textContent = `${worst.symbol.toUpperCase()} ${(worst.price_change_percentage_24h ?? 0).toFixed(1)}%`;
      loserEl.style.color = 'var(--red)';
    }
  }
}

customElements.define('stats-row', StatsRow);
