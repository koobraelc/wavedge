class AffiliateCta extends HTMLElement {
  static _config = null;
  static _configLoaded = false;
  static _userTier = null;

  connectedCallback() {
    this._symbol = (this.getAttribute('symbol') || '').toUpperCase();
    this._variant = this.getAttribute('variant') || 'token'; // 'token' or 'alert'
    this._load();
  }

  async _load() {
    // Load config and user tier in parallel (cached)
    if (!AffiliateCta._configLoaded) {
      AffiliateCta._configLoaded = true;
      try {
        const [configRes, meRes] = await Promise.all([
          fetch('/api/affiliate/config'),
          fetch('/api/auth/me', {
            headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('wavedge_token') || '') }
          }).catch(() => null)
        ]);
        AffiliateCta._config = await configRes.json();
        if (meRes && meRes.ok) {
          const user = await meRes.json();
          AffiliateCta._userTier = user.tier || 'free';
        }
      } catch {
        AffiliateCta._config = { enabled: false };
      }
    }

    this._render();
  }

  _render() {
    const config = AffiliateCta._config;
    if (!config || !config.enabled) return;

    // Hide for Pro users
    if (AffiliateCta._userTier === 'pro') return;

    if (!this._symbol) return;

    const pair = this._symbol + 'USDT';
    const exchanges = [];

    if (config.bybit) {
      exchanges.push({
        name: 'Bybit',
        url: config.bybit.replace('{PAIR}', pair).replace('{SYMBOL}', this._symbol),
        key: 'bybit'
      });
    }
    if (config.okx) {
      exchanges.push({
        name: 'OKX',
        url: config.okx.replace('{PAIR}', pair).replace('{SYMBOL}', this._symbol),
        key: 'okx'
      });
    }

    if (exchanges.length === 0) return;

    const ex = exchanges[0]; // Show primary exchange

    if (this._variant === 'alert') {
      this.innerHTML = `
        <a href="${this._esc(ex.url)}" target="_blank" rel="noopener nofollow"
           class="affiliate-link-inline" data-exchange="${this._esc(ex.key)}" data-token="${this._esc(this._symbol)}">
          Trade now &#8599;
        </a>`;
    } else {
      this.innerHTML = `
        <div class="affiliate-cta-box">
          ${exchanges.map(e => `
            <a href="${this._esc(e.url)}" target="_blank" rel="noopener nofollow"
               class="affiliate-cta-btn" data-exchange="${this._esc(e.key)}" data-token="${this._esc(this._symbol)}">
              Trade ${this._esc(this._symbol)} on ${this._esc(e.name)} &#8599;
            </a>
          `).join('')}
        </div>`;
    }

    // Track clicks
    this.querySelectorAll('[data-exchange]').forEach(el => {
      el.addEventListener('click', () => {
        const token = el.dataset.token;
        const exchange = el.dataset.exchange;
        fetch('/api/affiliate/click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, exchange })
        }).catch(() => {});
      });
    });
  }

  _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

customElements.define('affiliate-cta', AffiliateCta);
