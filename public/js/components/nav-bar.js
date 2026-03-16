class NavBar extends HTMLElement {
  connectedCallback() {
    const token = localStorage.getItem('wavedge_token');
    const isLoggedIn = !!token;

    this.innerHTML = `
      <header class="app-header">
        <a href="/" class="logo">Wave<span>edge</span></a>
        <div class="search-box">
          <input type="search" placeholder="Search tokens or news..." aria-label="Search" />
        </div>
        <nav class="header-nav">
          <a href="/dashboard">Dashboard</a>
          <a href="/settings/alerts">Alerts</a>
          ${isLoggedIn
            ? `<a href="/billing">Billing</a><button class="link-btn nav-logout">Log out</button>`
            : `<a href="/login" class="btn-login">Log in</a>`
          }
        </nav>
      </header>
    `;

    const input = this.querySelector('input');
    let debounce;
    input.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        this.dispatchEvent(new CustomEvent('nav-search', {
          bubbles: true,
          detail: { query: input.value.trim() }
        }));
      }, 300);
    });

    const logoutBtn = this.querySelector('.nav-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('wavedge_token');
        window.location.href = '/';
      });
    }
  }
}

customElements.define('nav-bar', NavBar);
