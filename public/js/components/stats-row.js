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
    row.innerHTML = `
      <div class="stat-card"><div class="label">Tokens Tracked</div><div class="value" id="stat-tokens">0</div></div>
      <div class="stat-card"><div class="label">Latest News</div><div class="value" id="stat-news">0</div></div>
      <div class="stat-card"><div class="label">Top Gainer (24h)</div><div class="value" id="stat-gainer">—</div></div>
      <div class="stat-card"><div class="label">Top Loser (24h)</div><div class="value" id="stat-loser">—</div></div>
    `;

    this._countUp('stat-tokens', prices.length);
    this._countUp('stat-news', newsCount);

    if (prices.length > 0) {
      const sorted = [...prices].sort((a, b) =>
        (b.price_change_percentage_24h ?? 0) - (a.price_change_percentage_24h ?? 0)
      );
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];

      const gainerEl = this.querySelector('#stat-gainer');
      const bestPct = (best.price_change_percentage_24h ?? 0).toFixed(1);
      gainerEl.textContent = `${best.symbol.toUpperCase()} +${bestPct}%`;
      gainerEl.style.color = 'var(--green)';

      const loserEl = this.querySelector('#stat-loser');
      const worstPct = (worst.price_change_percentage_24h ?? 0).toFixed(1);
      loserEl.textContent = `${worst.symbol.toUpperCase()} ${worstPct}%`;
      loserEl.style.color = 'var(--red)';
    }
  }

  _countUp(id, target) {
    const el = this.querySelector(`#${id}`);
    if (!el || target <= 0) { el.textContent = target; return; }

    const duration = 600;
    const start = performance.now();

    function step(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      el.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }
}

customElements.define('stats-row', StatsRow);
