class SignalDetailPanel extends HTMLElement {
  constructor() {
    super();
    this._open = false;
    this._symbol = null;
    this._data = {};
    this._onClickOutside = this._onClickOutside.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onScroll = this._onScroll.bind(this);
  }

  connectedCallback() {
    this.innerHTML = `<div class="sdp-popover" id="sdp-popover" role="dialog" aria-label="Token details"></div>`;
  }

  open(symbol, data) {
    // If clicking the same token, toggle off
    if (this._open && this._symbol === symbol.toUpperCase()) {
      this.close();
      return;
    }

    this._symbol = symbol.toUpperCase();
    this._data = data || {};
    this._open = true;

    this._render();
    this._position(data.anchorRect);

    const popover = this.querySelector('#sdp-popover');
    if (popover) popover.classList.add('sdp-visible');

    // Delay listener so the current click doesn't immediately close
    setTimeout(() => {
      document.addEventListener('click', this._onClickOutside, true);
    }, 0);
    document.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('scroll', this._onScroll, true);
  }

  close() {
    this._open = false;
    const popover = this.querySelector('#sdp-popover');
    if (popover) popover.classList.remove('sdp-visible');
    document.removeEventListener('click', this._onClickOutside, true);
    document.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('scroll', this._onScroll, true);
  }

  _onClickOutside(e) {
    const popover = this.querySelector('#sdp-popover');
    if (popover && !popover.contains(e.target)) {
      this.close();
    }
  }

  _onKeyDown(e) {
    if (e.key === 'Escape') this.close();
  }

  _onScroll() {
    this.close();
  }

  _position(anchorRect) {
    const popover = this.querySelector('#sdp-popover');
    if (!popover) return;

    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
      // Mobile: centered at bottom above bottom-nav
      popover.style.position = 'fixed';
      popover.style.bottom = '70px';
      popover.style.left = '12px';
      popover.style.right = '12px';
      popover.style.top = 'auto';
      popover.style.width = 'auto';
      return;
    }

    if (!anchorRect) {
      // Fallback: center on screen
      popover.style.position = 'fixed';
      popover.style.top = '50%';
      popover.style.left = '50%';
      popover.style.transform = 'translate(-50%, -50%)';
      return;
    }

    // Desktop: position near the clicked cell
    popover.style.position = 'fixed';
    popover.style.transform = '';
    const popW = 300;
    const popH = popover.offsetHeight || 200;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer below the cell, centered horizontally
    let top = anchorRect.bottom + 8;
    let left = anchorRect.left + anchorRect.width / 2 - popW / 2;

    // Flip above if not enough space below
    if (top + popH > vh - 20) {
      top = anchorRect.top - popH - 8;
    }
    // Clamp horizontal
    if (left < 12) left = 12;
    if (left + popW > vw - 12) left = vw - 12 - popW;
    // Clamp vertical
    if (top < 12) top = 12;

    popover.style.top = top + 'px';
    popover.style.left = left + 'px';
    popover.style.bottom = 'auto';
    popover.style.right = 'auto';
    popover.style.width = popW + 'px';
  }

  _render() {
    const popover = this.querySelector('#sdp-popover');
    if (!popover) return;
    const t = this._t();
    const priceData = this._data.price || {};
    const pct = priceData.price_change_percentage_24h ?? 0;
    const sign = pct >= 0 ? '+' : '';
    const pctClass = pct >= 0 ? 'sdp-green' : 'sdp-red';
    const price = priceData.current_price || priceData.price_usd;

    // Build one-line signal summary
    const signals = [];
    const news = this._data.newsSignal;
    const social = this._data.socialSentiment;
    const whale = this._data.whaleActivity;

    if (news && news.count > 0) {
      signals.push(`📰 ${news.count} article${news.count > 1 ? 's' : ''}`);
    }
    if (social && social.mentionCount > 0) {
      const label = social.sentimentLabel || 'neutral';
      signals.push(`💬 ${label}`);
    }
    if (whale && whale.transactionCount > 0) {
      signals.push(`🐋 ${whale.transactionCount} tx`);
    }
    const signalLine = signals.length > 0
      ? signals.join(' · ')
      : t('signal.noActiveSignals', { symbol: this._esc(this._symbol) });

    popover.innerHTML = `
      <div class="sdp-pop-header">
        <span class="sdp-pop-symbol">${this._esc(this._symbol)}</span>
        ${price ? `<span class="sdp-pop-price">${this._formatPrice(price)}</span>` : ''}
        <span class="sdp-pop-pct ${pctClass}">${sign}${pct.toFixed(2)}%</span>
      </div>
      <div class="sdp-pop-signals">${signalLine}</div>
      <div class="sdp-pop-actions">
        <a href="/settings/alerts?token=${encodeURIComponent(this._symbol)}" class="sdp-pop-btn sdp-pop-btn-secondary">${t('Set Alert')}</a>
        <a href="/tokens/${encodeURIComponent(this._symbol)}" class="sdp-pop-btn sdp-pop-btn-primary">${t('Full Analysis')} →</a>
      </div>
    `;
  }

  // --- Utilities ---
  _t() {
    return window.i18n ? window.i18n.t : (k) => k;
  }

  _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  _formatPrice(n) {
    if (n >= 1000) return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (n >= 1) return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
}

customElements.define('signal-detail-panel', SignalDetailPanel);
