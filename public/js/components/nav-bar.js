class NavBar extends HTMLElement {
  connectedCallback() {
    const token = localStorage.getItem('wavedge_token');
    const isLoggedIn = !!token;
    const currentTheme = window.__wavedgeCurrentTheme ? window.__wavedgeCurrentTheme() : 'default';
    const themes = window.__wavedgeThemes || {};
    const t = window.i18n ? window.i18n.t : (k) => k;

    const themeOptions = Object.entries(themes).map(([key, th]) =>
      `<button class="theme-btn${key === currentTheme ? ' active' : ''}" data-theme="${key}">${th.label}</button>`
    ).join('');

    // Language switcher options
    const locales = window.i18n ? window.i18n.SUPPORTED_LOCALES : ['en'];
    const labels = window.i18n ? window.i18n.LOCALE_LABELS : { en: 'English' };
    const currentLocale = window.i18n ? window.i18n.locale : 'en';
    const currentLabel = (currentLocale || 'en').toUpperCase().replace('-', '');
    const langOptions = locales.map(loc =>
      `<button class="lang-btn${loc === currentLocale ? ' active' : ''}" data-locale="${loc}">${labels[loc] || loc}</button>`
    ).join('');

    this.innerHTML = `
      <header class="app-header">
        <a href="/" class="logo">Wave<span>edge</span></a>
        <div class="search-box">
          <input type="search" placeholder="${t('nav.searchPlaceholder')}" aria-label="${t('nav.searchLabel')}" />
        </div>
        <nav class="header-nav">
          <a href="/dashboard">${t('nav.dashboard')}</a>
          <a href="/market">${t('nav.market')}</a>
          <a href="/settings/alerts">${t('nav.alerts')}</a>
          <div class="theme-switcher">
            <button class="theme-toggle" aria-label="${t('nav.switchTheme')}" title="${t('nav.switchTheme')}">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="8" cy="8" r="3.5"/>
                <path d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7"/>
              </svg>
            </button>
            <div class="theme-dropdown">${themeOptions}</div>
          </div>
          <div class="lang-switcher">
            <button class="lang-toggle" aria-label="${t('nav.language')}" title="${t('nav.language')}">
              <span class="lang-globe">🌐</span> ${currentLabel} ▾
            </button>
            <div class="lang-dropdown">${langOptions}</div>
          </div>
          ${isLoggedIn
            ? `<a href="/billing">${t('nav.billing')}</a><button class="link-btn nav-logout">${t('nav.logout')}</button>`
            : `<a href="/login" class="btn-login">${t('nav.login')}</a>`
          }
        </nav>
      </header>
    `;

    // Search
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

    // Logout
    const logoutBtn = this.querySelector('.nav-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('wavedge_token');
        window.location.href = '/';
      });
    }

    // Theme switcher
    const toggle = this.querySelector('.theme-toggle');
    const dropdown = this.querySelector('.theme-dropdown');
    if (toggle && dropdown) {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('open');
        // Close lang dropdown if open
        this.querySelector('.lang-dropdown')?.classList.remove('open');
      });

      dropdown.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const theme = btn.dataset.theme;
          if (window.__wavedgeApplyTheme) {
            window.__wavedgeApplyTheme(theme);
          }
          dropdown.classList.remove('open');
        });
      });
    }

    // Language switcher
    const langToggle = this.querySelector('.lang-toggle');
    const langDropdown = this.querySelector('.lang-dropdown');
    if (langToggle && langDropdown) {
      langToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        langDropdown.classList.toggle('open');
        // Close theme dropdown if open
        this.querySelector('.theme-dropdown')?.classList.remove('open');
      });

      langDropdown.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const locale = btn.dataset.locale;
          if (window.i18n) {
            window.i18n.setLocale(locale);
          }
        });
      });
    }

    // Close all dropdowns on outside click
    document.addEventListener('click', () => {
      this.querySelector('.theme-dropdown')?.classList.remove('open');
      this.querySelector('.lang-dropdown')?.classList.remove('open');
    });
  }
}

customElements.define('nav-bar', NavBar);
