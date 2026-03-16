class ApiKeyManager extends HTMLElement {
  connectedCallback() {
    this.token = localStorage.getItem('wavedge_token');
    this.innerHTML = '<div class="loading-state"><span class="spinner"></span>Loading API keys...</div>';
    if (!this.token) {
      this.innerHTML = '<p class="text-muted">Please <a href="/login">log in</a> to manage API keys.</p>';
      return;
    }
    this.load();
  }

  async load() {
    try {
      const [keysRes, usageRes] = await Promise.all([
        fetch('/api/api-keys', { headers: { Authorization: 'Bearer ' + this.token } }),
        fetch('/api/api-keys/usage', { headers: { Authorization: 'Bearer ' + this.token } }),
      ]);

      if (keysRes.status === 403) {
        this.innerHTML = `
          <div class="api-keys-upgrade">
            <h3>API Access — Pro Only</h3>
            <p>Generate API keys to access Wavedge data programmatically. Upgrade to Pro to unlock API access.</p>
            <a href="/billing" class="btn btn-primary">Upgrade to Pro</a>
          </div>`;
        return;
      }

      if (!keysRes.ok) throw new Error('Failed to load');

      const { keys } = await keysRes.json();
      const usage = usageRes.ok ? await usageRes.json() : null;

      this.render(keys, usage);
    } catch (err) {
      this.innerHTML = '<p class="text-error">Failed to load API keys. Please try again.</p>';
    }
  }

  render(keys, usage) {
    const activeKeys = keys.filter(k => !k.revoked_at);
    const revokedKeys = keys.filter(k => k.revoked_at);

    this.innerHTML = `
      ${usage ? `
      <div class="api-usage-bar">
        <div class="usage-label">
          <span>API Usage Today</span>
          <span class="usage-count">${usage.usage_today} / ${usage.daily_limit} requests</span>
        </div>
        <div class="usage-track">
          <div class="usage-fill" style="width: ${Math.min(100, (usage.usage_today / usage.daily_limit) * 100)}%"></div>
        </div>
        <div class="usage-meta">Active keys: ${usage.active_keys} / ${usage.max_keys}</div>
      </div>` : ''}

      <div class="api-key-create">
        <h3>Create New Key</h3>
        <form class="create-key-form" id="create-key-form">
          <input type="text" name="name" placeholder="Key name (e.g. My Trading Bot)" maxlength="50" class="input" />
          <button type="submit" class="btn btn-primary">Generate Key</button>
        </form>
        <div id="new-key-display" class="new-key-display" style="display:none">
          <div class="new-key-warning">Copy this key now — it won't be shown again.</div>
          <div class="new-key-value">
            <code id="new-key-value"></code>
            <button class="btn btn-sm btn-copy" id="copy-key-btn">Copy</button>
          </div>
        </div>
      </div>

      <div class="api-key-list">
        <h3>Active Keys</h3>
        ${activeKeys.length === 0
          ? '<p class="text-muted">No active API keys. Create one above.</p>'
          : `<table class="keys-table">
              <thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Last Used</th><th></th></tr></thead>
              <tbody>
                ${activeKeys.map(k => `
                  <tr>
                    <td>${this.esc(k.name)}</td>
                    <td><code>${this.esc(k.key_prefix)}...</code></td>
                    <td>${this.fmtDate(k.created_at)}</td>
                    <td>${k.last_used_at ? this.fmtDate(k.last_used_at) : 'Never'}</td>
                    <td><button class="btn btn-sm btn-danger revoke-btn" data-id="${k.id}">Revoke</button></td>
                  </tr>`).join('')}
              </tbody>
            </table>`
        }
      </div>

      ${revokedKeys.length > 0 ? `
      <details class="revoked-keys">
        <summary>Revoked Keys (${revokedKeys.length})</summary>
        <table class="keys-table keys-table-revoked">
          <thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Revoked</th></tr></thead>
          <tbody>
            ${revokedKeys.map(k => `
              <tr>
                <td>${this.esc(k.name)}</td>
                <td><code>${this.esc(k.key_prefix)}...</code></td>
                <td>${this.fmtDate(k.created_at)}</td>
                <td>${this.fmtDate(k.revoked_at)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </details>` : ''}

      <div class="api-docs-hint">
        <h3>Quick Start</h3>
        <pre><code>curl -H "Authorization: Bearer YOUR_API_KEY" \\
  ${window.location.origin}/api/prices</code></pre>
        <p class="text-muted">Use your API key as a Bearer token. Rate limit: 100 requests/day.</p>
      </div>
    `;

    // Bind events
    this.querySelector('#create-key-form').addEventListener('submit', (e) => this.handleCreate(e));
    this.querySelectorAll('.revoke-btn').forEach(btn => {
      btn.addEventListener('click', () => this.handleRevoke(btn.dataset.id));
    });
  }

  async handleCreate(e) {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim() || 'Default';
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Generating...';

    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + this.token,
        },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to create key');
        return;
      }

      const data = await res.json();

      // Show the key once
      const display = this.querySelector('#new-key-display');
      const valueEl = this.querySelector('#new-key-value');
      valueEl.textContent = data.key;
      display.style.display = 'block';

      this.querySelector('#copy-key-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(data.key).then(() => {
          const btn = this.querySelector('#copy-key-btn');
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
        });
      });

      // Reload the list after a brief moment
      setTimeout(() => this.load(), 500);
    } catch (err) {
      alert('Failed to create API key');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate Key';
    }
  }

  async handleRevoke(keyId) {
    if (!confirm('Revoke this API key? Any applications using it will stop working.')) return;

    try {
      const res = await fetch('/api/api-keys/' + keyId, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + this.token },
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to revoke key');
        return;
      }

      this.load();
    } catch {
      alert('Failed to revoke key');
    }
  }

  esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

customElements.define('api-key-manager', ApiKeyManager);
