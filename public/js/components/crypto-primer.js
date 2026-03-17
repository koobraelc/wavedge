/**
 * "New to crypto?" primer modal — a 30-second intro for beginners.
 * Shows on first visit (unless dismissed) or from nav help menu.
 */
class CryptoPrimer extends HTMLElement {
  static DISMISSED_KEY = 'wavedge_primer_dismissed';

  connectedCallback() {
    const t = window.i18n ? window.i18n.t : (k) => k;

    this.innerHTML = `
      <div class="primer-backdrop" hidden></div>
      <div class="primer-modal" hidden>
        <div class="primer-header">
          <h2 class="primer-title">${t('primer.title')}</h2>
          <button class="primer-close" aria-label="${t('primer.close')}">&times;</button>
        </div>
        <div class="primer-content">
          <div class="primer-card">
            <span class="primer-icon">&#x1FA99;</span>
            <h3>${t('primer.tokensTitle')}</h3>
            <p>${t('primer.tokensBody')}</p>
          </div>
          <div class="primer-card">
            <span class="primer-icon">&#x1F4B0;</span>
            <h3>${t('primer.marketCapTitle')}</h3>
            <p>${t('primer.marketCapBody')}</p>
          </div>
          <div class="primer-card">
            <span class="primer-icon">&#x1F4C8;</span>
            <h3>${t('primer.priceChangesTitle')}</h3>
            <p>${t('primer.priceChangesBody')}</p>
          </div>
        </div>
        <div class="primer-footer">
          <label class="primer-dismiss-label">
            <input type="checkbox" class="primer-dismiss-check" /> ${t('primer.dontShowAgain')}
          </label>
          <button class="primer-got-it">${t('primer.gotIt')}</button>
        </div>
      </div>
    `;

    this._backdrop = this.querySelector('.primer-backdrop');
    this._modal = this.querySelector('.primer-modal');
    this._checkbox = this.querySelector('.primer-dismiss-check');

    this.querySelector('.primer-close').addEventListener('click', () => this.close());
    this._backdrop.addEventListener('click', () => this.close());
    this.querySelector('.primer-got-it').addEventListener('click', () => this.close());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this._modal.hidden) this.close();
    });

    // Auto-show for new users who haven't dismissed it
    if (!localStorage.getItem(CryptoPrimer.DISMISSED_KEY) && !localStorage.getItem('wavedge_onboarding_complete')) {
      // Small delay so dashboard loads first
      setTimeout(() => this.open(), 1500);
    }
  }

  open() {
    this._backdrop.hidden = false;
    this._modal.hidden = false;
  }

  close() {
    this._backdrop.hidden = true;
    this._modal.hidden = true;
    if (this._checkbox && this._checkbox.checked) {
      localStorage.setItem(CryptoPrimer.DISMISSED_KEY, '1');
    }
  }
}

customElements.define('crypto-primer', CryptoPrimer);
