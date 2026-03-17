/**
 * Inline "What does this mean?" explainer for key dashboard widgets.
 *
 * Usage:
 *   <widget-explainer key="heatmap"></widget-explainer>
 *
 * The `key` attribute selects which explainer content to show.
 * Content is defined in i18n under `explainer.<key>.title` and `explainer.<key>.body`.
 */
class WidgetExplainer extends HTMLElement {
  constructor() {
    super();
    this._open = false;
  }

  connectedCallback() {
    const key = this.getAttribute('key') || '';
    const t = window.i18n ? window.i18n.t : (k) => k;

    const title = t(`explainer.${key}.title`);
    const body = t(`explainer.${key}.body`);

    this.innerHTML = `
      <button class="explainer-toggle" aria-expanded="false">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="8" cy="8" r="7"/>
          <path d="M6 6.5a2 2 0 1 1 2.5 1.94V10" stroke-linecap="round"/>
          <circle cx="8" cy="12.5" r="0.5" fill="currentColor" stroke="none"/>
        </svg>
        <span>${t('explainer.whatDoesThisMean')}</span>
      </button>
      <div class="explainer-panel" hidden>
        <div class="explainer-panel-title">${this._esc(title)}</div>
        <div class="explainer-panel-body">${this._esc(body)}</div>
      </div>
    `;

    const toggle = this.querySelector('.explainer-toggle');
    const panel = this.querySelector('.explainer-panel');

    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._open = !this._open;
      panel.hidden = !this._open;
      toggle.setAttribute('aria-expanded', this._open);
      toggle.classList.toggle('explainer-active', this._open);
    });
  }

  _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

customElements.define('widget-explainer', WidgetExplainer);
