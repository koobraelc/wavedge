class AlertSettings extends HTMLElement {
  connectedCallback() {
    this._prefs = null;
    this._tokens = [];
    this._saving = false;
    this._mode = localStorage.getItem('wavedge_alert_mode') || 'simple';
    this.innerHTML = '<div class="loading-state" role="status" aria-busy="true"><span class="spinner"></span>Loading settings...</div>';
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

    // Load alert usage for progressive warnings
    this._alertUsage = null;
    try {
      const token = localStorage.getItem('wavedge_token');
      if (token) {
        const userRes = await fetch('/api/auth/me', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          if (userData.tier !== 'pro') {
            const missedRes = await fetch('/api/alerts/missed?userId=' + encodeURIComponent(userData.id));
            if (missedRes.ok) {
              const missedJson = await missedRes.json();
              this._alertUsage = missedJson.data;
            }
          }
        }
      }
    } catch { /* non-critical */ }

    this._render();
    this._applyTokenParam();
  }

  _applyTokenParam() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) return;
    const symbol = token.toUpperCase();
    // Add to watchlist if not already selected
    if (!this._getSelectedSymbols().includes(symbol)) {
      this._addToken(symbol);
    }
    // Scroll the watchlist section into view
    const watchlist = this.querySelector('#watchlist-selected');
    if (watchlist) watchlist.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  _render() {
    if (this._mode === 'simple') {
      this._renderSimple();
    } else {
      this._renderAdvanced();
    }
  }

  _renderSimple() {
    const p = this._prefs || {};
    const watchlist = p.tokenSymbols || [];
    const enabled = p.enabled !== undefined ? p.enabled : true;
    // Map sensitivity to a threshold percentage for the simple slider
    const thresholdMap = { low: 10, medium: 5, high: 2 };
    const currentThreshold = thresholdMap[p.sensitivity] || 5;

    // Progressive alert usage warning
    const usageBanner = this._renderUsageBanner();

    this.innerHTML = `
      <form class="settings-form" id="alert-form">
        ${usageBanner}
        ${this._renderModeToggle()}

        <div class="settings-card">
          <div class="settings-card-header">
            <div class="settings-section-header">
              <span class="section-icon">&#9889;</span>
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

        <div class="settings-card simple-alert-card">
          <div class="settings-section-header">
            <span class="section-icon">&#128276;</span>
            <h3>Set up your alert</h3>
          </div>
          <p class="settings-hint">Pick a token and choose how big a price move should trigger an alert.</p>

          <div class="simple-alert-builder">
            <div class="simple-alert-sentence">
              <span class="simple-label">Tell me when</span>
              <div class="simple-token-select">
                <button type="button" class="simple-token-btn" id="simple-token-btn">
                  ${watchlist.length > 0 ? this._esc(watchlist[0]) : 'Pick a token'}
                  <span class="simple-caret">&#9662;</span>
                </button>
                <div class="simple-token-dropdown" id="simple-token-dropdown" hidden>
                  <input type="search" class="simple-token-search" id="simple-token-search" placeholder="Search tokens..." aria-label="Search tokens">
                  <div class="simple-token-list" id="simple-token-list"></div>
                </div>
              </div>
              <span class="simple-label">moves more than</span>
              <div class="simple-threshold-group">
                <div class="simple-threshold-options" id="simple-threshold-options">
                  ${[2, 5, 10, 20].map(pct => `
                    <button type="button" class="simple-threshold-btn ${currentThreshold === pct ? 'active' : ''}" data-threshold="${pct}">
                      ${pct}%
                    </button>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <div class="simple-selected-tokens" id="simple-selected-tokens">
            <p class="settings-hint" style="margin-bottom:8px">Watching:</p>
            <div class="watchlist-selected" id="watchlist-selected">
              ${watchlist.map(s => this._renderChip(s)).join('')}
            </div>
            ${watchlist.length === 0 ? '<p class="simple-empty-hint">No tokens selected yet. Pick one above to get started.</p>' : ''}
          </div>
        </div>

        <div class="settings-divider"></div>

        <div class="settings-card">
          <div class="settings-section-header">
            <span class="section-icon">&#128232;</span>
            <h3>How to notify you</h3>
          </div>
          <p class="settings-hint">We'll send alerts to web by default. Add email for extra coverage.</p>
          <div class="simple-channel-options">
            <label class="simple-channel-option">
              <input type="checkbox" name="channel" value="web" checked disabled>
              <span class="simple-channel-label">Web <span class="simple-channel-hint">(always on)</span></span>
            </label>
            <label class="simple-channel-option">
              <input type="checkbox" name="channel" value="email" ${(p.channels || []).includes('email') ? 'checked' : ''}>
              <span class="simple-channel-label">Email</span>
            </label>
            <div class="channel-detail ${(p.channels || []).includes('email') ? '' : 'hidden'}" id="email-detail">
              <input type="email" id="email-address" placeholder="you@example.com" value="${this._esc(p.emailAddress || '')}" aria-label="Email address for alerts">
            </div>
          </div>
        </div>

        <div class="settings-actions">
          <button type="submit" class="btn-primary" id="save-btn">Save Settings</button>
        </div>
      </form>
    `;

    this._bindSimple();
  }

  _renderAdvanced() {
    const p = this._prefs || {};
    const watchlist = p.tokenSymbols || [];
    const channels = p.channels || ['web'];
    const sensitivity = p.sensitivity || 'medium';
    const enabled = p.enabled !== undefined ? p.enabled : true;
    const minSignals = p.minSignals || 2;
    const telegramChatId = p.telegramChatId || '';
    const emailAddress = p.emailAddress || '';

    // Progressive alert usage warning
    const usageBanner = this._renderUsageBanner();

    this.innerHTML = `
      <form class="settings-form" id="alert-form">
        ${usageBanner}
        ${this._renderModeToggle()}

        <div class="settings-card">
          <div class="settings-card-header">
            <div class="settings-section-header">
              <span class="section-icon">&#9889;</span>
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
          <div class="settings-section-header">
            <span class="section-icon">&#9733;</span>
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
          <div class="settings-section-header">
            <span class="section-icon">&#128276;</span>
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
              <div class="telegram-input-row">
                <input type="text" id="telegram-chat-id" placeholder="e.g. 123456789" value="${this._esc(telegramChatId)}" inputmode="numeric" pattern="[0-9]*" aria-label="Telegram Chat ID">
                <a href="https://t.me/WavedgeBot?start=connect" target="_blank" rel="noopener" class="btn-secondary btn-sm telegram-connect-btn">Connect via Telegram</a>
              </div>
              <span class="field-hint">Click "Connect via Telegram" to auto-link your account, or paste your Chat ID manually.</span>
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
              <input type="email" id="email-address" placeholder="you@example.com" value="${this._esc(emailAddress)}" aria-label="Email address for alerts">
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
          <div class="settings-section-header">
            <span class="section-icon">&#9881;</span>
            <h3>Sensitivity <info-tip text="Higher sensitivity triggers more alerts. We recommend Medium for most users."></info-tip></h3>
          </div>
          <p class="settings-hint">Controls how easily alerts are triggered. Higher sensitivity = more alerts.</p>
          <div class="sensitivity-selector">
            <button type="button" class="sensitivity-btn ${sensitivity === 'low' ? 'active' : ''}" data-level="low">
              <strong>Low</strong>
              <span>Major moves only</span>
              <span class="sensitivity-detail">e.g. price change &gt; 8%, volume spike &gt; 200%</span>
            </button>
            <button type="button" class="sensitivity-btn ${sensitivity === 'medium' ? 'active' : ''}" data-level="medium">
              <span class="recommended-badge">Recommended</span>
              <strong>Medium</strong>
              <span>Balanced — catches important moves without noise</span>
              <span class="sensitivity-detail">e.g. price change &gt; 5%, volume spike &gt; 100%</span>
            </button>
            <button type="button" class="sensitivity-btn ${sensitivity === 'high' ? 'active' : ''}" data-level="high">
              <strong>High</strong>
              <span>Don't miss anything</span>
              <span class="sensitivity-detail">e.g. price change &gt; 2%, volume spike &gt; 50%</span>
            </button>
          </div>
        </div>

        <div class="settings-divider"></div>

        <div class="settings-card">
          <div class="settings-section-header">
            <span class="section-icon">&#128202;</span>
            <h3>Signal Requirements <info-tip text="How many signals must fire together to trigger an alert. We recommend 2-3 to reduce noise."></info-tip></h3>
          </div>
          <p class="settings-hint">How many signals must fire simultaneously to trigger an alert.</p>
          <div class="signal-selector">
            ${[1, 2, 3, 4, 5].map(n => `
              <label class="signal-option ${minSignals === n ? 'active' : ''}">
                <input type="radio" name="minSignals" value="${n}" ${minSignals === n ? 'checked' : ''}>
                ${n === 2 ? '<span class="recommended-badge">Recommended</span>' : ''}
                <strong>${n} signal${n > 1 ? 's' : ''}</strong>
                <span>${n === 1 ? 'Any single signal' : n === 2 ? 'Two+ signals together' : n === 3 ? 'Three+ signals' : n === 4 ? 'Four+ signals' : 'All five signals'}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div class="settings-actions">
          <button type="submit" class="btn-primary" id="save-btn">Save Settings</button>
        </div>
      </form>
    `;

    this._bindAdvanced();
  }

  _renderModeToggle() {
    return `
      <div class="alert-mode-toggle">
        <button type="button" class="mode-toggle-btn ${this._mode === 'simple' ? 'active' : ''}" data-mode="simple">Simple</button>
        <button type="button" class="mode-toggle-btn ${this._mode === 'advanced' ? 'active' : ''}" data-mode="advanced">Advanced</button>
      </div>
    `;
  }

  _renderUsageBanner() {
    if (!this._alertUsage) return '';
    const total = this._alertUsage.dailyLimit || 3;
    const sent = total - Math.max(0, this._alertUsage.missedToday || 0);
    const remaining = Math.max(0, total - sent);
    const pct = Math.round((sent / total) * 100);
    const urgency = remaining === 0 ? 'alert-usage-full' : remaining === 1 ? 'alert-usage-warning' : 'alert-usage-ok';

    return `
      <div class="alert-usage-banner ${urgency}">
        <div class="alert-usage-header">
          <span class="alert-usage-label">${sent} of ${total} alerts used today</span>
          ${remaining === 0 ? '<a href="/billing" class="alert-usage-upgrade">Upgrade for unlimited</a>' : ''}
        </div>
        <div class="alert-usage-bar">
          <div class="alert-usage-fill" style="width: ${pct}%"></div>
        </div>
        ${remaining <= 1 && remaining > 0 ? '<span class="alert-usage-hint">Only 1 alert remaining today. <a href="/billing">Upgrade for unlimited.</a></span>' : ''}
      </div>`;
  }

  _renderChip(symbol) {
    const initial = symbol.charAt(0);
    return `<span class="token-chip" data-symbol="${this._esc(symbol)}">
      <span class="token-chip-icon">${initial}</span>
      <span class="token-chip-label">${this._esc(symbol)}</span>
      <button type="button" class="chip-remove" aria-label="Remove ${this._esc(symbol)}">&times;</button>
    </span>`;
  }

  _bindModeToggle() {
    this.querySelectorAll('.mode-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const newMode = btn.dataset.mode;
        if (newMode === this._mode) return;
        this._mode = newMode;
        localStorage.setItem('wavedge_alert_mode', newMode);
        this._render();
        this._applyTokenParam();
      });
    });
  }

  _bindSimple() {
    this._bindModeToggle();

    const form = this.querySelector('#alert-form');
    const enabledToggle = this.querySelector('#alerts-enabled');
    const tokenBtn = this.querySelector('#simple-token-btn');
    const tokenDropdown = this.querySelector('#simple-token-dropdown');
    const tokenSearch = this.querySelector('#simple-token-search');
    const tokenList = this.querySelector('#simple-token-list');
    const selectedContainer = this.querySelector('#watchlist-selected');

    // Toggle label update
    enabledToggle.addEventListener('change', () => {
      this.querySelector('.toggle-label').textContent = enabledToggle.checked ? 'Active' : 'Paused';
    });

    // Simple token picker
    tokenBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      tokenDropdown.hidden = !tokenDropdown.hidden;
      if (!tokenDropdown.hidden) {
        tokenSearch.value = '';
        this._filterSimpleTokens('');
        tokenSearch.focus();
      }
    });

    let debounce;
    tokenSearch.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => this._filterSimpleTokens(tokenSearch.value.trim()), 150);
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!this.contains(e.target)) tokenDropdown.hidden = true;
    });

    // Threshold buttons
    this.querySelectorAll('.simple-threshold-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.querySelectorAll('.simple-threshold-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Remove chips
    selectedContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip-remove');
      if (btn) {
        const chip = btn.closest('.token-chip');
        chip.classList.add('chip-removing');
        setTimeout(() => chip.remove(), 200);
        // Update empty hint
        setTimeout(() => {
          if (this._getSelectedSymbols().length === 0) {
            const hint = this.querySelector('.simple-empty-hint');
            if (!hint) {
              const container = this.querySelector('#simple-selected-tokens');
              const p = document.createElement('p');
              p.className = 'simple-empty-hint';
              p.textContent = 'No tokens selected yet. Pick one above to get started.';
              container.appendChild(p);
            }
          }
        }, 250);
      }
    });

    // Channel toggles
    this.querySelectorAll('input[name="channel"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const emailDetail = this.querySelector('#email-detail');
        const emailCb = this.querySelector('input[value="email"]');
        if (emailDetail && emailCb) emailDetail.classList.toggle('hidden', !emailCb.checked);
      });
    });

    // Form submit
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this._saveSimple();
    });
  }

  _filterSimpleTokens(query) {
    const tokenList = this.querySelector('#simple-token-list');
    const selected = this._getSelectedSymbols();
    const q = query.toLowerCase();

    let matches = this._tokens.filter(t =>
      t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
    ).slice(0, 12);

    if (!matches.length) {
      tokenList.innerHTML = '<div class="simple-token-empty">No tokens found</div>';
      return;
    }

    tokenList.innerHTML = matches.map(t => `
      <button type="button" class="simple-token-item ${selected.includes(t.symbol) ? 'selected' : ''}" data-symbol="${this._esc(t.symbol)}">
        <span class="simple-token-icon">${t.symbol.charAt(0)}</span>
        <span class="simple-token-name">${this._esc(t.symbol)}</span>
        <span class="simple-token-full">${this._esc(t.name)}</span>
        ${selected.includes(t.symbol) ? '<span class="simple-token-check">&#10003;</span>' : ''}
      </button>
    `).join('');

    tokenList.querySelectorAll('.simple-token-item').forEach(item => {
      item.addEventListener('click', () => {
        const sym = item.dataset.symbol;
        this._addToken(sym);
        // Update button text
        this.querySelector('#simple-token-btn').innerHTML = this._esc(sym) + ' <span class="simple-caret">&#9662;</span>';
        this.querySelector('#simple-token-dropdown').hidden = true;
        // Remove empty hint
        const hint = this.querySelector('.simple-empty-hint');
        if (hint) hint.remove();
        // Re-render dropdown selections
      });
    });
  }

  _bindAdvanced() {
    this._bindModeToggle();

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

  async _saveSimple() {
    if (this._saving) return;
    this._saving = true;

    const btn = this.querySelector('#save-btn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const tokenSymbols = this._getSelectedSymbols();
    const channels = ['web'];
    const emailCb = this.querySelector('input[value="email"]');
    if (emailCb && emailCb.checked) channels.push('email');
    const emailAddress = this.querySelector('#email-address')?.value.trim() || null;

    // Map threshold to sensitivity
    const threshold = Number(this.querySelector('.simple-threshold-btn.active')?.dataset.threshold || 5);
    const sensitivityMap = { 2: 'high', 5: 'medium', 10: 'low', 20: 'low' };
    const sensitivity = sensitivityMap[threshold] || 'medium';

    const enabled = this.querySelector('#alerts-enabled').checked;

    // Client-side email validation
    if (emailAddress && channels.includes('email')) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(emailAddress)) {
        AlertSettings._showToast('Please enter a valid email address', 'error');
        const emailInput = this.querySelector('#email-address');
        emailInput.focus();
        emailInput.classList.add('input-error');
        setTimeout(() => emailInput.classList.remove('input-error'), 3000);
        btn.disabled = false;
        btn.textContent = 'Save Settings';
        this._saving = false;
        return;
      }
    }

    const body = {
      userId: 'default',
      tokenSymbols,
      channels,
      sensitivity,
      minSignals: 2,
      enabled,
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

    // Client-side email validation
    if (emailAddress && channels.includes('email')) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(emailAddress)) {
        AlertSettings._showToast('Please enter a valid email address', 'error');
        const emailInput = this.querySelector('#email-address');
        emailInput.focus();
        emailInput.classList.add('input-error');
        setTimeout(() => emailInput.classList.remove('input-error'), 3000);
        btn.disabled = false;
        btn.textContent = 'Save Settings';
        this._saving = false;
        return;
      }
    }

    // Telegram Chat ID validation
    if (telegramChatId && channels.includes('telegram')) {
      if (!/^\d+$/.test(telegramChatId)) {
        AlertSettings._showToast('Telegram Chat ID must be a number', 'error');
        const tgInput = this.querySelector('#telegram-chat-id');
        tgInput.focus();
        tgInput.classList.add('input-error');
        setTimeout(() => tgInput.classList.remove('input-error'), 3000);
        btn.disabled = false;
        btn.textContent = 'Save Settings';
        this._saving = false;
        return;
      }
    }

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
