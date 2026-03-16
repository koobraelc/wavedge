class AlertSettings extends HTMLElement {
  connectedCallback() {
    this._prefs = null;
    this._tokens = [];
    this._saving = false;
    this.innerHTML = '<div class="loading-state"><span class="spinner"></span>Loading settings...</div>';
    this._load();
  }

  async _load() {
    const [prefsRes, tokensRes, pushStatusRes] = await Promise.all([
      fetch('/api/alerts/preferences?userId=default'),
      fetch('/api/prices'),
      fetch('/api/alerts/push/status?userId=default')
    ]);
    const prefsJson = await prefsRes.json();
    const tokensJson = await tokensRes.json();
    const pushStatusJson = await pushStatusRes.json();

    this._prefs = prefsJson.data;
    this._tokens = (tokensJson.data || []).map(t => ({
      symbol: t.symbol.toUpperCase(),
      name: t.name
    }));
    this._pushSubscribed = pushStatusJson.data?.subscribed || false;

    this._render();
  }

  _render() {
    const p = this._prefs || {};
    const watchlist = p.tokenSymbols || [];
    const channels = p.channels || ['web'];
    const sensitivity = p.sensitivity || 'medium';
    const enabled = p.enabled !== undefined ? p.enabled : true;
    const minSignals = p.minSignals || 2;
    const telegramChatId = p.telegramChatId || '';
    const emailAddress = p.emailAddress || '';

    this.innerHTML = `
      <form class="settings-form" id="alert-form">
        <div class="settings-card">
          <div class="settings-card-header">
            <div class="settings-step-header">
              <span class="step-number">1</span>
              <h3>Alert Status</h3>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" id="alerts-enabled" ${enabled ? 'checked' : ''}>
              <span class="toggle-slider"></span>
              <span class="toggle-label">${enabled ? 'Active' : 'Paused'}</span>
            </label>
          </div>
        </div>

        <div class="settings-divider"></div>

        <div class="settings-card">
          <div class="settings-step-header">
            <span class="step-number">2</span>
            <h3>Token Watchlist</h3>
          </div>
          <p class="settings-hint">Select tokens you want to receive alerts for.</p>
          <div class="watchlist-search">
            <input type="search" id="token-search" placeholder="Search tokens..." aria-label="Search tokens">
          </div>
          <div class="watchlist-selected" id="watchlist-selected">
            ${watchlist.map(s => this._renderChip(s)).join('')}
          </div>
          <div class="watchlist-dropdown" id="watchlist-dropdown" hidden></div>
        </div>

        <div class="settings-divider"></div>

        <div class="settings-card">
          <div class="settings-step-header">
            <span class="step-number">3</span>
            <h3>Notification Channels</h3>
          </div>
          <p class="settings-hint">Choose how you want to receive alerts.</p>
          <div class="channel-options">
            <label class="channel-option">
              <input type="checkbox" name="channel" value="web" ${channels.includes('web') ? 'checked' : ''}>
              <div class="channel-info">
                <strong>Web</strong>
                <span>Alerts shown in dashboard history</span>
              </div>
            </label>
            <label class="channel-option">
              <input type="checkbox" name="channel" value="telegram" ${channels.includes('telegram') ? 'checked' : ''}>
              <div class="channel-info">
                <strong>Telegram</strong>
                <span>Get alerts via Telegram bot</span>
              </div>
            </label>
            <div class="channel-detail ${channels.includes('telegram') ? '' : 'hidden'}" id="telegram-detail">
              <label for="telegram-chat-id">Telegram Chat ID</label>
              <input type="text" id="telegram-chat-id" placeholder="e.g. 123456789" value="${this._esc(telegramChatId)}">
              <span class="field-hint">Send /start to @WavedgeBot to get your chat ID</span>
            </div>
            <label class="channel-option">
              <input type="checkbox" name="channel" value="email" ${channels.includes('email') ? 'checked' : ''}>
              <div class="channel-info">
                <strong>Email</strong>
                <span>Receive email notifications</span>
              </div>
            </label>
            <div class="channel-detail ${channels.includes('email') ? '' : 'hidden'}" id="email-detail">
              <label for="email-address">Email Address</label>
              <input type="email" id="email-address" placeholder="you@example.com" value="${this._esc(emailAddress)}">
            </div>
            <label class="channel-option">
              <input type="checkbox" name="channel" value="push" ${channels.includes('push') ? 'checked' : ''}>
              <div class="channel-info">
                <strong>Push Notifications</strong>
                <span>Browser push alerts even when tab is closed</span>
              </div>
            </label>
            <div class="channel-detail ${channels.includes('push') ? '' : 'hidden'}" id="push-detail">
              <span class="push-status" id="push-status">${this._pushSubscribed ? 'Subscribed to push notifications' : 'Not yet subscribed'}</span>
              <button type="button" class="btn-secondary btn-sm" id="push-enable-btn">${this._pushSubscribed ? 'Resubscribe' : 'Enable Push'}</button>
            </div>
          </div>
        </div>

        <div class="settings-divider"></div>

        <div class="settings-card">
          <div class="settings-step-header">
            <span class="step-number">4</span>
            <h3>Sensitivity</h3>
          </div>
          <p class="settings-hint">Controls how easily alerts are triggered. Higher sensitivity = more alerts.</p>
          <div class="sensitivity-selector">
            <button type="button" class="sensitivity-btn ${sensitivity === 'low' ? 'active' : ''}" data-level="low">
              <strong>Low</strong>
              <span>Major moves only</span>
              <span class="sensitivity-detail">8% price, 200% volume</span>
            </button>
            <button type="button" class="sensitivity-btn ${sensitivity === 'medium' ? 'active' : ''}" data-level="medium">
              <strong>Medium</strong>
              <span>Balanced alerts</span>
              <span class="sensitivity-detail">5% price, 100% volume</span>
            </button>
            <button type="button" class="sensitivity-btn ${sensitivity === 'high' ? 'active' : ''}" data-level="high">
              <strong>High</strong>
              <span>Don't miss anything</span>
              <span class="sensitivity-detail">2% price, 50% volume</span>
            </button>
          </div>
        </div>

        <div class="settings-divider"></div>

        <div class="settings-card">
          <div class="settings-step-header">
            <span class="step-number">5</span>
            <h3>Signal Requirements</h3>
          </div>
          <p class="settings-hint">How many signals must fire simultaneously to trigger an alert.</p>
          <div class="signal-selector">
            ${[1, 2, 3].map(n => `
              <label class="signal-option ${minSignals === n ? 'active' : ''}">
                <input type="radio" name="minSignals" value="${n}" ${minSignals === n ? 'checked' : ''}>
                <strong>${n} signal${n > 1 ? 's' : ''}</strong>
                <span>${n === 1 ? 'Any single signal' : n === 2 ? 'Two+ signals together' : 'All three signals'}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="settings-actions">
          <button type="submit" class="btn-primary" id="save-btn">Save Settings</button>
        </div>
      </form>
    `;

    this._bind();
  }

  _renderChip(symbol) {
    const initial = symbol.charAt(0);
    return `<span class="token-chip" data-symbol="${this._esc(symbol)}">
      <span class="token-chip-icon">${initial}</span>
      <span class="token-chip-label">${this._esc(symbol)}</span>
      <button type="button" class="chip-remove" aria-label="Remove ${this._esc(symbol)}">&times;</button>
    </span>`;
  }

  _bind() {
    const form = this.querySelector('#alert-form');
    const searchInput = this.querySelector('#token-search');
    const dropdown = this.querySelector('#watchlist-dropdown');
    const selectedContainer = this.querySelector('#watchlist-selected');
    const enabledToggle = this.querySelector('#alerts-enabled');

    // Toggle label update
    enabledToggle.addEventListener('change', () => {
      this.querySelector('.toggle-label').textContent = enabledToggle.checked ? 'Active' : 'Paused';
    });

    // Token search
    let debounce;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => this._filterTokens(searchInput.value.trim()), 150);
    });
    searchInput.addEventListener('focus', () => this._filterTokens(searchInput.value.trim()));

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!this.contains(e.target)) dropdown.hidden = true;
    });

    // Remove chips
    selectedContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip-remove');
      if (btn) {
        const chip = btn.closest('.token-chip');
        chip.classList.add('chip-removing');
        setTimeout(() => chip.remove(), 200);
      }
    });

    // Channel toggles - show/hide detail fields
    this.querySelectorAll('input[name="channel"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const telegramDetail = this.querySelector('#telegram-detail');
        const emailDetail = this.querySelector('#email-detail');
        const pushDetail = this.querySelector('#push-detail');
        const telegramCb = this.querySelector('input[value="telegram"]');
        const emailCb = this.querySelector('input[value="email"]');
        const pushCb = this.querySelector('input[value="push"]');
        telegramDetail.classList.toggle('hidden', !telegramCb.checked);
        emailDetail.classList.toggle('hidden', !emailCb.checked);
        pushDetail.classList.toggle('hidden', !pushCb.checked);
      });
    });

    // Push notification enable button
    const pushEnableBtn = this.querySelector('#push-enable-btn');
    if (pushEnableBtn) {
      pushEnableBtn.addEventListener('click', () => this._enablePush());
    }

    // Sensitivity buttons
    this.querySelectorAll('.sensitivity-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.querySelectorAll('.sensitivity-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Signal radio buttons - update active styling
    this.querySelectorAll('.signal-option input').forEach(radio => {
      radio.addEventListener('change', () => {
        this.querySelectorAll('.signal-option').forEach(opt => opt.classList.remove('active'));
        radio.closest('.signal-option').classList.add('active');
      });
    });

    // Form submit
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this._save();
    });
  }

  _filterTokens(query) {
    const dropdown = this.querySelector('#watchlist-dropdown');
    const selected = this._getSelectedSymbols();
    const q = query.toLowerCase();

    let matches = this._tokens.filter(t =>
      !selected.includes(t.symbol) &&
      (t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
    );

    if (!matches.length) {
      dropdown.hidden = true;
      return;
    }

    matches = matches.slice(0, 10);
    dropdown.innerHTML = matches.map(t => `
      <button type="button" class="dropdown-item" data-symbol="${this._esc(t.symbol)}">
        <span class="dropdown-chip-icon">${t.symbol.charAt(0)}</span>
        <span class="token-symbol">${this._esc(t.symbol)}</span>
        <span class="token-name">${this._esc(t.name)}</span>
      </button>
    `).join('');
    dropdown.hidden = false;

    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        const sym = item.dataset.symbol;
        this._addToken(sym);
        dropdown.hidden = true;
        this.querySelector('#token-search').value = '';
      });
    });
  }

  _addToken(symbol) {
    const container = this.querySelector('#watchlist-selected');
    if (this._getSelectedSymbols().includes(symbol)) return;

    const chip = document.createElement('span');
    chip.className = 'token-chip chip-adding';
    chip.dataset.symbol = symbol;
    chip.innerHTML = `
      <span class="token-chip-icon">${symbol.charAt(0)}</span>
      <span class="token-chip-label">${this._esc(symbol)}</span>
      <button type="button" class="chip-remove" aria-label="Remove ${this._esc(symbol)}">&times;</button>`;
    container.appendChild(chip);
    // Trigger entrance animation
    requestAnimationFrame(() => chip.classList.remove('chip-adding'));
  }

  _getSelectedSymbols() {
    return Array.from(this.querySelectorAll('.token-chip')).map(t => t.dataset.symbol);
  }

  async _enablePush() {
    const statusEl = this.querySelector('#push-status');
    const btn = this.querySelector('#push-enable-btn');

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      AlertSettings._showToast('Push notifications are not supported in this browser', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Enabling...';

    try {
      // Get VAPID public key from server
      const vapidRes = await fetch('/api/alerts/push/vapid-public-key');
      if (!vapidRes.ok) {
        throw new Error('Push notifications not configured on server');
      }
      const vapidJson = await vapidRes.json();
      const vapidPublicKey = vapidJson.data.publicKey;

      // Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Notification permission denied');
      }

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this._urlBase64ToUint8Array(vapidPublicKey)
      });

      // Send subscription to server
      const subJson = subscription.toJSON();
      const res = await fetch('/api/alerts/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'default',
          subscription: {
            endpoint: subJson.endpoint,
            keys: subJson.keys
          }
        })
      });

      if (!res.ok) throw new Error('Failed to save subscription');

      this._pushSubscribed = true;
      statusEl.textContent = 'Subscribed to push notifications';
      btn.textContent = 'Resubscribe';
      AlertSettings._showToast('Push notifications enabled', 'success');
    } catch (err) {
      AlertSettings._showToast(err.message || 'Failed to enable push notifications', 'error');
      btn.textContent = 'Enable Push';
    } finally {
      btn.disabled = false;
    }
  }

  _urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var rawData = atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async _save() {
    if (this._saving) return;
    this._saving = true;

    const btn = this.querySelector('#save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const tokenSymbols = this._getSelectedSymbols();
    const channels = Array.from(this.querySelectorAll('input[name="channel"]:checked')).map(cb => cb.value);
    const sensitivity = this.querySelector('.sensitivity-btn.active')?.dataset.level || 'medium';
    const minSignals = Number(this.querySelector('input[name="minSignals"]:checked')?.value || 2);
    const enabled = this.querySelector('#alerts-enabled').checked;
    const telegramChatId = this.querySelector('#telegram-chat-id').value.trim() || null;
    const emailAddress = this.querySelector('#email-address').value.trim() || null;

    const body = {
      userId: 'default',
      tokenSymbols,
      channels,
      sensitivity,
      minSignals,
      enabled,
      telegramChatId,
      emailAddress
    };

    try {
      const method = this._prefs ? 'PATCH' : 'POST';
      const res = await fetch('/api/alerts/preferences', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save');
      }

      const json = await res.json();
      this._prefs = json.data;
      AlertSettings._showToast('Settings saved successfully', 'success');
      this.dispatchEvent(new CustomEvent('settings-saved', { bubbles: true }));
    } catch (err) {
      AlertSettings._showToast(err.message || 'Failed to save settings', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Settings';
      this._saving = false;
    }
  }

  static _showToast(message, type) {
    // Remove existing toasts
    document.querySelectorAll('.toast-notification').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${type === 'success' ? '&#10003;' : '&#10007;'}</span>
      <span class="toast-message">${message}</span>`;
    document.body.appendChild(toast);

    // Trigger entrance
    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    // Auto-remove
    setTimeout(() => {
      toast.classList.remove('toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  _esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }
}

customElements.define('alert-settings', AlertSettings);
