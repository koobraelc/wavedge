// Post-onboarding guidance component
// Shows "what to explore next" when user first lands on dashboard after onboarding
class PostOnboarding extends HTMLElement {
  connectedCallback() {
    const STORAGE_KEY = 'wavedge_post_onboarding_dismissed';
    const ONBOARDING_KEY = 'wavedge_onboarding_complete';

    // Only show if user just completed onboarding or has no watchlist history
    const fromOnboarding = new URLSearchParams(window.location.search).get('new') === '1';
    const dismissed = localStorage.getItem(STORAGE_KEY);

    if (dismissed && !fromOnboarding) {
      this.style.display = 'none';
      return;
    }

    // Mark onboarding complete if arriving with ?new=1
    if (fromOnboarding) {
      localStorage.setItem(ONBOARDING_KEY, '1');
      localStorage.removeItem(STORAGE_KEY);
    }

    // Don't show if user has been around (welcome banner already dismissed)
    if (!fromOnboarding && localStorage.getItem('wavedge_welcome_dismissed')) {
      this.style.display = 'none';
      return;
    }

    this._render();
    this._loadTopTokens();
  }

  _render() {
    this.innerHTML = `
      <div class="post-onboarding">
        <button class="post-onboarding-dismiss" aria-label="Dismiss">&times;</button>
        <div class="post-onboarding-header">
          <h3 class="post-onboarding-title">What to explore next</h3>
          <p class="post-onboarding-subtitle">Your watchlist is set up. Here are some things to try:</p>
        </div>
        <div class="post-onboarding-actions">
          <a href="/market" class="post-onboarding-card">
            <span class="post-onboarding-icon">&#9632;</span>
            <div>
              <strong>Market Overview</strong>
              <p>See all tokens, sector performance, and top movers in one view.</p>
            </div>
          </a>
          <a href="/settings/alerts" class="post-onboarding-card">
            <span class="post-onboarding-icon">&#9888;</span>
            <div>
              <strong>Fine-tune Alerts</strong>
              <p>Adjust sensitivity, add channels, and pick which signals matter to you.</p>
            </div>
          </a>
          <div class="post-onboarding-card post-onboarding-tokens-card" id="post-onboarding-tokens">
            <span class="post-onboarding-icon">&#128200;</span>
            <div>
              <strong>Trending Tokens</strong>
              <p>Explore the most active tokens right now:</p>
              <div class="post-onboarding-token-chips" id="post-onboarding-chips">
                <span class="skeleton" style="width:60px;height:24px;border-radius:12px;display:inline-block"></span>
                <span class="skeleton" style="width:50px;height:24px;border-radius:12px;display:inline-block"></span>
                <span class="skeleton" style="width:55px;height:24px;border-radius:12px;display:inline-block"></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.querySelector('.post-onboarding-dismiss').addEventListener('click', () => {
      localStorage.setItem('wavedge_post_onboarding_dismissed', '1');
      this.style.display = 'none';
    });
  }

  async _loadTopTokens() {
    try {
      const res = await fetch('/api/prices');
      if (!res.ok) return;
      const { data } = await res.json();
      const top = (data || [])
        .sort((a, b) => (b.news_count_24h || 0) - (a.news_count_24h || 0))
        .slice(0, 5);

      const chips = this.querySelector('#post-onboarding-chips');
      if (!chips || top.length === 0) return;

      chips.innerHTML = top.map(t => {
        const sym = this._esc(t.symbol.toUpperCase());
        const pct = t.price_change_percentage_24h ?? 0;
        const cls = pct >= 0 ? 'post-onboarding-chip-up' : 'post-onboarding-chip-down';
        const sign = pct >= 0 ? '+' : '';
        return `<a href="/tokens/${encodeURIComponent(t.symbol.toUpperCase())}" class="post-onboarding-chip ${cls}">
          <span>${sym}</span>
          <span class="post-onboarding-chip-change">${sign}${pct.toFixed(1)}%</span>
        </a>`;
      }).join('');
    } catch {
      // Non-critical — chips remain as skeletons briefly then hide
      const chips = this.querySelector('#post-onboarding-chips');
      if (chips) chips.innerHTML = '';
    }
  }

  _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

customElements.define('post-onboarding', PostOnboarding);
