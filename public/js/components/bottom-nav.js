class BottomNav extends HTMLElement {
  connectedCallback() {
    const path = window.location.pathname;

    this.innerHTML = `
      <nav class="bottom-nav" role="navigation" aria-label="Mobile navigation">
        <div class="bottom-nav-inner">
          <a href="/dashboard" class="bottom-nav-item${path === '/dashboard' ? ' active' : ''}" aria-label="Dashboard">
            <span class="bottom-nav-icon">&#9632;</span>
            <span>Dashboard</span>
          </a>
          <a href="/settings/alerts" class="bottom-nav-item${path === '/settings/alerts' ? ' active' : ''}" aria-label="Alerts">
            <span class="bottom-nav-icon">&#9888;</span>
            <span>Alerts</span>
          </a>
          <a href="/tokens/BTC" class="bottom-nav-item${path.startsWith('/tokens') ? ' active' : ''}" aria-label="Tokens">
            <span class="bottom-nav-icon">&#11044;</span>
            <span>Tokens</span>
          </a>
          <a href="/billing" class="bottom-nav-item${path === '/billing' ? ' active' : ''}" aria-label="Settings">
            <span class="bottom-nav-icon">&#9881;</span>
            <span>Settings</span>
          </a>
        </div>
      </nav>
    `;
  }
}

customElements.define('bottom-nav', BottomNav);
