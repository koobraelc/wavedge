class AlertHistory extends HTMLElement {
  connectedCallback() {
    this._hours = 24;
    this.innerHTML = '<div class="loading-state"><span class="spinner"></span>Loading alert history...</div>';
    this._load();

    // Refresh when settings are saved
    document.addEventListener('settings-saved', () => this._load());
  }

  async _load() {
    try {
      const res = await fetch(`/api/alerts/history?userId=default&hours=${this._hours}`);
      const json = await res.json();
      this._render(json.data || []);
    } catch (err) {
      this.innerHTML = '<div class="loading-state">Failed to load alert history</div>';
    }
  }

  _render(alerts) {
    if (!alerts.length) {
      this.innerHTML = `
        <div class="history-empty">
          <p>No alerts triggered in the last ${this._hours} hours.</p>
          <p class="settings-hint">Alerts fire when multiple signals (news, price, volume) breach thresholds simultaneously.</p>
        </div>
      `;
      return;
    }

    this.innerHTML = `
      <div class="history-controls">
        <div class="history-range">
          ${[24, 48, 72, 168].map(h => `
            <button type="button" class="range-btn ${this._hours === h ? 'active' : ''}" data-hours="${h}">
              ${h <= 48 ? h + 'h' : Math.round(h / 24) + 'd'}
            </button>
          `).join('')}
        </div>
        <span class="history-count">${alerts.length} alert${alerts.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="history-timeline">
        ${alerts.map((a, i) => this._renderAlert(a, i === alerts.length - 1)).join('')}
      </div>
    `;

    this.querySelectorAll('.history-range .range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._hours = Number(btn.dataset.hours);
        this._load();
      });
    });
  }

  _renderAlert(alert, isLast) {
    const time = this._formatTime(alert.createdAt);
    const fullTime = alert.createdAt ? new Date(alert.createdAt).toLocaleString() : '';
    const signals = alert.signals || {};
    const channels = alert.deliveredChannels || [];

    // Build mini price indicator
    let priceIndicator = '';
    if (signals.priceMovement) {
      const pct = signals.priceMovement.changePercent;
      const cls = pct >= 0 ? 'positive' : 'negative';
      const sign = pct >= 0 ? '+' : '';
      priceIndicator = `
        <div class="alert-price-indicator ${cls}">
          <span class="alert-price-arrow">${pct >= 0 ? '&#9650;' : '&#9660;'}</span>
          <span>${sign}${pct.toFixed(2)}%</span>
        </div>`;
    }

    return `
      <div class="history-timeline-item ${isLast ? 'last' : ''}">
        <div class="timeline-rail">
          <div class="timeline-node ${alert.signalCount >= 3 ? 'node-critical' : alert.signalCount >= 2 ? 'node-warning' : ''}"></div>
          ${!isLast ? '<div class="timeline-line"></div>' : ''}
        </div>
        <div class="history-card">
          <div class="history-card-header">
            <span class="token-tag">${this._esc(alert.tokenSymbol)}</span>
            <span class="history-signals">${alert.signalCount} signal${alert.signalCount !== 1 ? 's' : ''}</span>
            ${priceIndicator}
            <span class="history-time" title="${fullTime}">${time}</span>
          </div>
          <p class="history-summary">${this._esc(alert.summary)}</p>
          <div class="history-details">
            ${this._renderSignals(signals)}
            <div class="history-channels">
              ${channels.map(ch => `<span class="channel-badge">${this._esc(ch)}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _renderSignals(signals) {
    const parts = [];
    if (signals.newsFrequency) {
      parts.push(`<span class="signal-badge">News: ${signals.newsFrequency.count} articles</span>`);
    }
    if (signals.priceMovement) {
      const pct = signals.priceMovement.changePercent;
      const cls = pct >= 0 ? 'positive' : 'negative';
      const sign = pct >= 0 ? '+' : '';
      parts.push(`<span class="signal-badge ${cls}">Price: ${sign}${pct.toFixed(2)}%</span>`);
    }
    if (signals.volumeChange) {
      parts.push(`<span class="signal-badge">Volume: +${signals.volumeChange.changePercent.toFixed(0)}%</span>`);
    }
    return parts.length ? `<div class="history-signal-list">${parts.join('')}</div>` : '';
  }

  _formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  _esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
}

customElements.define('alert-history', AlertHistory);
