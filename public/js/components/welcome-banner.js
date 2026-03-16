class WelcomeBanner extends HTMLElement {
  connectedCallback() {
    const STORAGE_KEY = 'wavedge_welcome_dismissed';
    if (localStorage.getItem(STORAGE_KEY)) {
      this.style.display = 'none';
      return;
    }

    const t = window.i18n ? window.i18n.t : (k) => k;

    this.innerHTML = `
      <div class="welcome-banner">
        <button class="welcome-dismiss" aria-label="${t('welcome.dismiss')}" title="${t('welcome.dismiss')}">&times;</button>
        <h2 class="welcome-title">${t('welcome.title')}</h2>
        <p class="welcome-desc">${t('welcome.description')}</p>
        <div class="welcome-actions">
          <a href="/settings/alerts" class="welcome-cta">
            <span class="welcome-cta-icon">&#9733;</span>
            ${t('welcome.setupWatchlist')}
          </a>
          <a href="#impact-feed" class="welcome-cta" data-action="scroll-impact">
            <span class="welcome-cta-icon">&#9889;</span>
            ${t('welcome.learnImpact')}
          </a>
          <a href="/settings/alerts" class="welcome-cta">
            <span class="welcome-cta-icon">&#9888;</span>
            ${t('welcome.setupAlerts')}
          </a>
        </div>
      </div>
    `;

    // Dismiss button
    this.querySelector('.welcome-dismiss').addEventListener('click', () => {
      localStorage.setItem(STORAGE_KEY, '1');
      this.style.display = 'none';
    });

    // Scroll to impact feed
    this.querySelector('[data-action="scroll-impact"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      const feed = document.querySelector('impact-feed');
      if (feed) feed.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

customElements.define('welcome-banner', WelcomeBanner);
