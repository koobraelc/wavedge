/**
 * "New to crypto?" primer — lightweight toast notification for beginners.
 * Shows on first visit (unless dismissed) or from nav help menu.
 * Replaces the old modal with a less intrusive toast UX.
 */
class CryptoPrimer extends HTMLElement {
  static DISMISSED_KEY = 'wavedge_primer_dismissed';

  connectedCallback() {
    const t = window.i18n ? window.i18n.t : (k) => k;

    this.innerHTML = `
      <div class="primer-toast" hidden>
        <div class="primer-toast-icon">&#127891;</div>
        <div class="primer-toast-body">
          <div class="primer-toast-title">${t('primer.title')}</div>
          <div class="primer-toast-text">${t('primer.tokensBody')}</div>
        </div>
        <button class="primer-toast-close" aria-label="${t('primer.close')}">&times;</button>
      </div>
    `;

    this._toast = this.querySelector('.primer-toast');

    this.querySelector('.primer-toast-close').addEventListener('click', () => this.close());

    // Auto-dismiss after 8 seconds
    this._autoDismissTimer = null;

    // Auto-show for new users who haven't dismissed it
    if (!localStorage.getItem(CryptoPrimer.DISMISSED_KEY) && !localStorage.getItem('wavedge_onboarding_complete')) {
      setTimeout(() => this.open(), 1500);
    }
  }

  open() {
    this._toast.hidden = false;
    // Trigger entrance animation on next frame
    requestAnimationFrame(() => {
      this._toast.classList.add('primer-toast-visible');
    });
    // Auto-dismiss after 8 seconds
    clearTimeout(this._autoDismissTimer);
    this._autoDismissTimer = setTimeout(() => this.close(), 8000);
  }

  close() {
    clearTimeout(this._autoDismissTimer);
    this._toast.classList.remove('primer-toast-visible');
    // Wait for exit animation then hide
    setTimeout(() => {
      this._toast.hidden = true;
    }, 300);
    localStorage.setItem(CryptoPrimer.DISMISSED_KEY, '1');
  }
}

customElements.define('crypto-primer', CryptoPrimer);
