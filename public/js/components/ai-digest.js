class AiDigest extends HTMLElement {
  connectedCallback() {
    this.innerHTML = '<div class="ai-digest loading-state"><span class="spinner"></span></div>';
    this._load();
  }

  async _load() {
    try {
      const locale = window.i18n ? window.i18n.locale : 'en';
      const lang = locale.startsWith('zh') ? 'zh' : 'en';
      const res = await fetch('/api/digest/latest?lang=' + lang);
      if (!res.ok) {
        this._renderFallback();
        return;
      }
      const { data } = await res.json();
      this._renderDigest(data);
    } catch {
      this._renderFallback();
    }
  }

  _renderDigest(digest) {
    const t = window.i18n ? window.i18n.t : (k) => k;
    const age = this._timeAgo(digest.generated_at);

    this.innerHTML = `
      <div class="ai-digest">
        <div class="ai-digest-header">
          <span class="ai-digest-icon">&#129302;</span>
          <h3 class="ai-digest-title">${t('digest.title')}</h3>
          <span class="ai-digest-time">${age}</span>
        </div>
        <div class="ai-digest-body">${digest.contentHtml || digest.content_html || ''}</div>
      </div>
    `;
  }

  _renderFallback() {
    const t = window.i18n ? window.i18n.t : (k) => k;
    this.innerHTML = `
      <div class="ai-digest">
        <div class="ai-digest-header">
          <span class="ai-digest-icon">&#129302;</span>
          <h3 class="ai-digest-title">${t('digest.title')}</h3>
        </div>
        <div class="ai-digest-body">
          <p class="ai-digest-empty">${t('digest.noDigest')}</p>
        </div>
      </div>
    `;
  }

  _timeAgo(dateStr) {
    if (!dateStr) return '';
    const t = window.i18n ? window.i18n.t : (k) => k;
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('time.justNow');
    if (mins < 60) return t('time.mAgo', { n: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return t('time.hAgo', { n: hrs });
    return t('time.dAgo', { n: Math.floor(hrs / 24) });
  }
}

customElements.define('ai-digest', AiDigest);
