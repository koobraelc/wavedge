class MissedAlertsBanner extends HTMLElement {
  constructor() {
    super();
    this._data = null;
  }

  connectedCallback() {
    this.innerHTML = '';
    this._loadMissedAlerts();
  }

  async _loadMissedAlerts() {
    const token = localStorage.getItem('wavedge_token');
    if (!token) return;

    // Get user info to get userId
    try {
      const userRes = await fetch('/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!userRes.ok) return;
      const userData = await userRes.json();
      const userId = userData.id;
      const tier = userData.tier;
      if (!userId || tier === 'pro') return;

      const res = await fetch('/api/alerts/missed?userId=' + encodeURIComponent(userId));
      if (!res.ok) return;
      const { data } = await res.json();
      this._data = data;
      this._render();
    } catch (err) {
      // Silently fail — banner is non-critical
    }
  }

  _render() {
    const d = this._data;
    if (!d || d.tier === 'pro' || d.missedToday === 0) {
      this.innerHTML = '';
      return;
    }

    const missedList = d.alerts.slice(0, 5);

    this.innerHTML = `
      <div class="missed-alerts-banner">
        <div class="missed-alerts-content">
          <div class="missed-alerts-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2L1 18h18L10 2z" stroke="currentColor" stroke-width="1.5" fill="none"/>
              <path d="M10 8v4M10 14v1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="missed-alerts-text">
            <strong>You missed ${this._esc(String(d.missedToday))} alert${d.missedToday === 1 ? '' : 's'} today</strong>
            <span class="missed-alerts-sub">Pro users got them all. Free plan: ${d.dailyLimit} alerts/day.</span>
          </div>
          <a href="/billing" class="missed-alerts-cta">Upgrade to Pro</a>
        </div>
        ${missedList.length > 0 ? `
          <div class="missed-alerts-list">
            ${missedList.map(a => `
              <div class="missed-alert-item">
                <span class="missed-alert-token">${this._esc(a.tokenSymbol)}</span>
                <span class="missed-alert-summary">${this._esc(a.summary)}</span>
                <span class="missed-alert-time">${this._relativeTime(a.createdAt)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  _relativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

customElements.define('missed-alerts-banner', MissedAlertsBanner);
