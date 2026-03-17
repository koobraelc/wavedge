class NavBar extends HTMLElement {
  connectedCallback() {
    const token = localStorage.getItem('wavedge_token');
    const isLoggedIn = !!token;
    const currentTheme = window.__wavedgeCurrentTheme ? window.__wavedgeCurrentTheme() : 'default';
    const themes = window.__wavedgeThemes || {};
    const t = window.i18n ? window.i18n.t : (k) => k;

    const themeOptions = Object.entries(themes).map(([key, th]) =>
      `<button class="settings-menu-btn theme-btn${key === currentTheme ? ' active' : ''}" data-theme="${key}">${th.label}</button>`
    ).join('');

    // Language switcher options
    const locales = window.i18n ? window.i18n.SUPPORTED_LOCALES : ['en'];
    const labels = window.i18n ? window.i18n.LOCALE_LABELS : { en: 'English' };
    const currentLocale = window.i18n ? window.i18n.locale : 'en';
    const langOptions = locales.map(loc =>
      `<button class="settings-menu-btn lang-btn${loc === currentLocale ? ' active' : ''}" data-locale="${loc}">${labels[loc] || loc}</button>`
    ).join('');

    const path = window.location.pathname;

    this.innerHTML = `
      <header class="app-header">
        <a href="/" class="logo">Wave<span>edge</span></a>
        <div class="search-box" role="combobox" aria-expanded="false" aria-haspopup="listbox">
          <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="7" cy="7" r="5"/>
            <path d="M11 11l3.5 3.5"/>
          </svg>
          <input type="search" placeholder="${t('nav.searchPlaceholder')}" aria-label="${t('nav.searchLabel')}" aria-autocomplete="list" aria-controls="search-dropdown" autocomplete="off" />
          <div class="search-dropdown" id="search-dropdown" role="listbox" hidden></div>
        </div>
        <nav class="header-nav">
          <a href="/dashboard"${path === '/dashboard' || path === '/' ? ' class="active"' : ''}>${t('nav.dashboard')}</a>
          <a href="/market"${path === '/market' || path.startsWith('/tokens/') ? ' class="active"' : ''}>${t('nav.market')}</a>
          <div class="settings-dropdown">
            <button class="settings-toggle" aria-label="${t('nav.settings')}" title="${t('nav.settings')}">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="8" cy="8" r="2.5"/>
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/>
              </svg>
              <span class="settings-label">${t('nav.settings')}</span>
            </button>
            <div class="settings-menu">
              <a href="/settings/alerts" class="settings-menu-item">
                <span class="settings-menu-icon">&#9888;</span>
                ${t('nav.alertSettings')}
              </a>
              <a href="/settings/watchlist" class="settings-menu-item">
                <span class="settings-menu-icon">&#9733;</span>
                ${t('nav.watchlist')}
              </a>
              <a href="/settings/api-keys" class="settings-menu-item">
                <span class="settings-menu-icon">&#128273;</span>
                ${t('nav.apiKeys')}
              </a>
              <a href="/billing" class="settings-menu-item">
                <span class="settings-menu-icon">&#128179;</span>
                ${t('nav.billing')}
              </a>
              <div class="settings-menu-divider"></div>
              <div class="settings-menu-section">${t('nav.help')}</div>
              <button class="settings-menu-btn" id="nav-glossary-btn">
                <span class="settings-menu-icon">&#128218;</span>
                ${t('nav.glossary')}
              </button>
              <button class="settings-menu-btn" id="nav-primer-btn">
                <span class="settings-menu-icon">&#127891;</span>
                ${t('nav.newToCrypto')}
              </button>
              <div class="settings-menu-divider"></div>
              <div class="settings-menu-section">${t('nav.switchTheme')}</div>
              <div class="settings-theme-list">${themeOptions}</div>
              <div class="settings-menu-divider"></div>
              <div class="settings-menu-section">${t('nav.language')}</div>
              <div class="settings-lang-list">${langOptions}</div>
            </div>
          </div>
          ${isLoggedIn
            ? `<button class="link-btn nav-logout">${t('nav.logout')}</button>`
            : `<a href="/login" class="btn-login">${t('nav.login')}</a>`
          }
        </nav>
        <button class="hamburger-btn" aria-label="Menu" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
      </header>
    `;

    // Search with dropdown
    const input = this.querySelector('input[type="search"]');
    const searchBox = this.querySelector('.search-box');
    const dropdown = this.querySelector('#search-dropdown');
    let debounce;
    let activeIndex = -1;
    const RECENT_KEY = 'wavedge_recent_searches';
    const MAX_RECENT = 5;

    function getRecent() {
      try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
    }
    function saveRecent(symbol, name) {
      let recent = getRecent().filter(r => r.symbol !== symbol);
      recent.unshift({ symbol, name });
      recent = recent.slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    }

    function esc(s) {
      if (!s) return '';
      const d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    function fmtPrice(p) {
      if (!p) return '';
      if (p >= 1) return '$' + Number(p).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return '$' + Number(p).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
    }

    function showDropdown(html) {
      dropdown.innerHTML = html;
      dropdown.hidden = false;
      searchBox.setAttribute('aria-expanded', 'true');
      activeIndex = -1;
    }

    function hideDropdown() {
      dropdown.hidden = true;
      searchBox.setAttribute('aria-expanded', 'false');
      activeIndex = -1;
    }

    function showRecent() {
      const recent = getRecent();
      if (!recent.length) { hideDropdown(); return; }
      const items = recent.map((r, i) => `
        <a href="/tokens/${encodeURIComponent(r.symbol)}" class="search-result-item" role="option" data-index="${i}" data-symbol="${esc(r.symbol)}">
          <span class="search-result-icon">${esc(r.symbol.charAt(0))}</span>
          <span class="search-result-info">
            <span class="search-result-symbol">${esc(r.symbol.toUpperCase())}</span>
            <span class="search-result-name">${esc(r.name)}</span>
          </span>
          <span class="search-result-tag">Recent</span>
        </a>`).join('');
      showDropdown(`<div class="search-section-label">Recent Searches</div>${items}`);
    }

    async function doSearch(query) {
      if (!query) { showRecent(); return; }
      try {
        const res = await fetch('/api/search?q=' + encodeURIComponent(query) + '&limit=8');
        if (!res.ok) return;
        const { data } = await res.json();
        const tokens = data.tokens || [];
        if (!tokens.length) {
          showDropdown('<div class="search-empty">No tokens found</div>');
          return;
        }
        const items = tokens.map((tok, i) => `
          <a href="/tokens/${encodeURIComponent(tok.symbol)}" class="search-result-item" role="option" data-index="${i}" data-symbol="${esc(tok.symbol)}" data-name="${esc(tok.name)}">
            <span class="search-result-icon">${esc(tok.symbol.charAt(0))}</span>
            <span class="search-result-info">
              <span class="search-result-symbol">${esc(tok.symbol.toUpperCase())}</span>
              <span class="search-result-name">${esc(tok.name)}</span>
            </span>
            ${tok.price_usd ? `<span class="search-result-price">${fmtPrice(tok.price_usd)}</span>` : ''}
          </a>`).join('');
        showDropdown(items);
      } catch { /* silent */ }
    }

    input.addEventListener('input', () => {
      clearTimeout(debounce);
      const q = input.value.trim();
      debounce = setTimeout(() => doSearch(q), 200);
      // Also dispatch the old event for dashboard feed filtering
      this.dispatchEvent(new CustomEvent('nav-search', {
        bubbles: true,
        detail: { query: q }
      }));
    });

    input.addEventListener('focus', () => {
      if (!input.value.trim()) showRecent();
    });

    // Keyboard navigation
    input.addEventListener('keydown', (e) => {
      const items = dropdown.querySelectorAll('.search-result-item');
      if (!items.length || dropdown.hidden) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, items.length - 1);
        items.forEach((it, i) => it.classList.toggle('search-result-active', i === activeIndex));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        items.forEach((it, i) => it.classList.toggle('search-result-active', i === activeIndex));
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        const item = items[activeIndex];
        if (item.dataset.symbol) saveRecent(item.dataset.symbol, item.dataset.name || item.dataset.symbol);
        window.location.href = item.href;
      } else if (e.key === 'Escape') {
        hideDropdown();
        input.blur();
      }
    });

    // Click on result
    dropdown.addEventListener('click', (e) => {
      const item = e.target.closest('.search-result-item');
      if (item && item.dataset.symbol) {
        saveRecent(item.dataset.symbol, item.dataset.name || item.dataset.symbol);
      }
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!searchBox.contains(e.target)) hideDropdown();
    });

    // Logout
    const logoutBtn = this.querySelector('.nav-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('wavedge_token');
        window.location.href = '/';
      });
    }

    // Settings dropdown
    const settingsToggle = this.querySelector('.settings-toggle');
    const settingsMenu = this.querySelector('.settings-menu');
    if (settingsToggle && settingsMenu) {
      settingsToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = settingsMenu.classList.toggle('open');
        settingsToggle.setAttribute('aria-expanded', isOpen);
      });

      // Theme buttons
      settingsMenu.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const theme = btn.dataset.theme;
          if (window.__wavedgeApplyTheme) {
            window.__wavedgeApplyTheme(theme);
          }
          settingsMenu.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });

      // Language buttons
      settingsMenu.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const locale = btn.dataset.locale;
          if (window.i18n) {
            window.i18n.setLocale(locale);
          }
        });
      });
    }

    // Glossary button
    const glossaryBtn = this.querySelector('#nav-glossary-btn');
    if (glossaryBtn) {
      glossaryBtn.addEventListener('click', () => {
        const gl = document.querySelector('crypto-glossary');
        if (gl) gl.open();
        settingsMenu?.classList.remove('open');
      });
    }

    // Primer button
    const primerBtn = this.querySelector('#nav-primer-btn');
    if (primerBtn) {
      primerBtn.addEventListener('click', () => {
        const pr = document.querySelector('crypto-primer');
        if (pr) pr.open();
        settingsMenu?.classList.remove('open');
      });
    }

    // Hamburger menu (mobile)
    const hamburger = this.querySelector('.hamburger-btn');
    const headerNav = this.querySelector('.header-nav');
    if (hamburger && headerNav) {
      hamburger.addEventListener('click', () => {
        const isOpen = headerNav.classList.toggle('mobile-open');
        hamburger.classList.toggle('active', isOpen);
        hamburger.setAttribute('aria-expanded', isOpen);
      });
    }

    // Close dropdowns on outside click
    document.addEventListener('click', () => {
      settingsMenu?.classList.remove('open');
      settingsToggle?.setAttribute('aria-expanded', 'false');
    });

    // Prevent settings menu clicks from closing the menu
    settingsMenu?.addEventListener('click', (e) => {
      // Only stop propagation for non-link clicks (theme/lang buttons)
      if (!e.target.closest('a')) {
        e.stopPropagation();
      }
    });
  }
}

customElements.define('nav-bar', NavBar);
