class StaleDataBanner extends HTMLElement {
  connectedCallback() {
    this.innerHTML = '';
    this._check();
    // Re-check every 2 minutes
    this._interval = setInterval(() => this._check(), 120000);
  }

  disconnectedCallback() {
    if (this._interval) clearInterval(this._interval);
  }

  async _check() {
    try {
      const res = await fetch('/api/health/freshness');
      if (!res.ok) return;
      const data = await res.json();
      this._render(data);
    } catch {
      // Non-critical — silently fail
    }
  }

  _render(data) {
    if (!data.stale) {
      this.innerHTML = '';
      return;
    }

    const age = data.ageMinutes != null
      ? (data.ageMinutes >= 60 ? Math.floor(data.ageMinutes / 60) + 'h' : data.ageMinutes + 'min')
      : 'unknown';

    this.innerHTML = `
      <div class="stale-data-banner">
        <div class="stale-data-content">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 4v4l2.5 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>Data may be delayed (last update: ${age} ago)</span>
        </div>
        <button class="stale-data-dismiss" aria-label="Dismiss">&times;</button>
      </div>
    `;

    const btn = this.querySelector('.stale-data-dismiss');
    if (btn) btn.addEventListener('click', () => { this.innerHTML = ''; });
  }
}

customElements.define('stale-data-banner', StaleDataBanner);
