/**
 * Crypto glossary modal accessible from the nav bar help menu.
 * Opens as a slide-in panel with searchable terms.
 */
class CryptoGlossary extends HTMLElement {
  connectedCallback() {
    const t = window.i18n ? window.i18n.t : (k) => k;

    this._terms = [
      { term: t('glossary.token.term'), def: t('glossary.token.def') },
      { term: t('glossary.marketCap.term'), def: t('glossary.marketCap.def') },
      { term: t('glossary.volume.term'), def: t('glossary.volume.def') },
      { term: t('glossary.priceChange.term'), def: t('glossary.priceChange.def') },
      { term: t('glossary.bullish.term'), def: t('glossary.bullish.def') },
      { term: t('glossary.bearish.term'), def: t('glossary.bearish.def') },
      { term: t('glossary.whale.term'), def: t('glossary.whale.def') },
      { term: t('glossary.signal.term'), def: t('glossary.signal.def') },
      { term: t('glossary.impactScore.term'), def: t('glossary.impactScore.def') },
      { term: t('glossary.sentiment.term'), def: t('glossary.sentiment.def') },
      { term: t('glossary.heatmap.term'), def: t('glossary.heatmap.def') },
      { term: t('glossary.watchlist.term'), def: t('glossary.watchlist.def') },
    ];

    this.innerHTML = `
      <div class="glossary-backdrop" hidden></div>
      <div class="glossary-panel" hidden>
        <div class="glossary-header">
          <h2 class="glossary-title">${t('glossary.title')}</h2>
          <button class="glossary-close" aria-label="${t('glossary.close')}">&times;</button>
        </div>
        <input type="search" class="glossary-search" placeholder="${t('glossary.searchPlaceholder')}" aria-label="${t('glossary.searchPlaceholder')}" autocomplete="off" />
        <div class="glossary-list"></div>
      </div>
    `;

    this._backdrop = this.querySelector('.glossary-backdrop');
    this._panel = this.querySelector('.glossary-panel');
    this._list = this.querySelector('.glossary-list');
    this._searchInput = this.querySelector('.glossary-search');

    this.querySelector('.glossary-close').addEventListener('click', () => this.close());
    this._backdrop.addEventListener('click', () => this.close());

    this._searchInput.addEventListener('input', () => {
      this._renderList(this._searchInput.value.trim().toLowerCase());
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this._panel.hidden) this.close();
    });

    this._renderList('');
  }

  open() {
    this._backdrop.hidden = false;
    this._panel.hidden = false;
    this._searchInput.value = '';
    this._renderList('');
    this._searchInput.focus();
  }

  close() {
    this._backdrop.hidden = true;
    this._panel.hidden = true;
  }

  _renderList(query) {
    const filtered = query
      ? this._terms.filter(t => t.term.toLowerCase().includes(query) || t.def.toLowerCase().includes(query))
      : this._terms;

    if (!filtered.length) {
      const t = window.i18n ? window.i18n.t : (k) => k;
      this._list.innerHTML = `<div class="glossary-empty">${t('glossary.noResults')}</div>`;
      return;
    }

    this._list.innerHTML = filtered.map(item => `
      <div class="glossary-item">
        <dt class="glossary-term">${this._esc(item.term)}</dt>
        <dd class="glossary-def">${this._esc(item.def)}</dd>
      </div>
    `).join('');
  }

  _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

customElements.define('crypto-glossary', CryptoGlossary);
