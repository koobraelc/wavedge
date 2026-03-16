// Configurable ad slot component
// Loads ad code from /api/config/ads endpoint. Hidden for Pro users.
// Falls back to house ad (upgrade CTA) when no ad code is configured.
class AdSlot extends HTMLElement {
  static _config = null;
  static _configLoaded = false;
  static _userTier = null;
  static _loadPromise = null;

  connectedCallback() {
    this._variant = this.getAttribute('variant') || 'banner'; // 'banner' | 'sidebar' | 'digest'
    this._loadAndRender();
  }

  async _loadAndRender() {
    if (!AdSlot._configLoaded) {
      AdSlot._configLoaded = true;
      AdSlot._loadPromise = this._fetchConfig();
    }
    if (AdSlot._loadPromise) {
      await AdSlot._loadPromise;
    }
    this._render();
  }

  async _fetchConfig() {
    try {
      const [adsRes, meRes] = await Promise.all([
        fetch('/api/config/ads'),
        fetch('/api/auth/me', {
          headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('wavedge_token') || '') }
        }).catch(() => null)
      ]);
      if (adsRes.ok) {
        AdSlot._config = await adsRes.json();
      } else {
        AdSlot._config = {};
      }
      if (meRes && meRes.ok) {
        const user = await meRes.json();
        AdSlot._userTier = user.tier || 'free';
      }
    } catch {
      AdSlot._config = {};
    }
  }

  _render() {
    // Pro users see no ads
    if (AdSlot._userTier === 'pro') {
      this.style.display = 'none';
      return;
    }

    const config = AdSlot._config || {};
    const variant = this._variant;
    let adCode = '';
    let sizeClass = '';

    if (variant === 'sidebar') {
      adCode = config.sidebarCode || '';
      sizeClass = 'ad-slot-sidebar';
    } else {
      // banner and digest use banner code
      adCode = config.bannerCode || '';
      sizeClass = 'ad-slot-banner';
    }

    if (adCode) {
      // Render the provided ad snippet
      this.innerHTML = '<div class="ad-slot ' + sizeClass + '">' + adCode + '</div>';
      // Execute any script tags in the ad code
      this.querySelectorAll('script').forEach(function (oldScript) {
        var newScript = document.createElement('script');
        if (oldScript.src) {
          newScript.src = oldScript.src;
        } else {
          newScript.textContent = oldScript.textContent;
        }
        oldScript.parentNode.replaceChild(newScript, oldScript);
      });
    } else {
      // House ad fallback: upgrade CTA
      this.innerHTML =
        '<div class="ad-slot ' + sizeClass + ' ad-slot-house">' +
          '<a href="/billing" class="ad-house-link">' +
            '<span class="ad-house-text">Upgrade to Pro — no ads, real-time alerts, full history</span>' +
            '<span class="ad-house-btn">Go Pro</span>' +
          '</a>' +
        '</div>';
    }
  }
}

customElements.define('ad-slot', AdSlot);
