class BreadcrumbNav extends HTMLElement {
  connectedCallback() {
    const path = window.location.pathname;
    const crumbs = this._buildCrumbs(path);

    if (crumbs.length <= 1) {
      this.style.display = 'none';
      return;
    }

    this.innerHTML = `
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <ol>
          ${crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            return isLast
              ? `<li class="breadcrumb-current" aria-current="page">${crumb.label}</li>`
              : `<li><a href="${crumb.href}">${crumb.label}</a><span class="breadcrumb-sep" aria-hidden="true">/</span></li>`;
          }).join('')}
        </ol>
      </nav>
    `;
  }

  _buildCrumbs(path) {
    const t = window.i18n ? window.i18n.t : (k) => k;
    const crumbs = [{ label: t('nav.dashboard'), href: '/dashboard' }];

    // /tokens/:symbol
    const tokenMatch = path.match(/^\/tokens\/([A-Za-z0-9]+)/);
    if (tokenMatch) {
      crumbs.push({ label: t('nav.market'), href: '/market' });
      crumbs.push({ label: tokenMatch[1].toUpperCase(), href: path });
      return crumbs;
    }

    // /settings/*
    if (path.startsWith('/settings')) {
      crumbs.push({ label: t('nav.settings'), href: '/settings/alerts' });
      if (path === '/settings/alerts') {
        crumbs.push({ label: t('nav.alertSettings'), href: path });
      } else if (path === '/settings/watchlist') {
        crumbs.push({ label: t('nav.watchlist'), href: path });
      } else if (path === '/settings/api-keys') {
        crumbs.push({ label: t('nav.apiKeys'), href: path });
      }
      return crumbs;
    }

    // /billing
    if (path === '/billing') {
      crumbs.push({ label: t('nav.settings'), href: '/settings/alerts' });
      crumbs.push({ label: t('nav.billing'), href: path });
      return crumbs;
    }

    // /market
    if (path === '/market') {
      crumbs.push({ label: t('nav.market'), href: path });
      return crumbs;
    }

    // /compare
    if (path === '/compare') {
      crumbs.push({ label: t('nav.compare') || 'Compare', href: path });
      return crumbs;
    }

    return crumbs;
  }
}

customElements.define('breadcrumb-nav', BreadcrumbNav);
