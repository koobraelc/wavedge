class InfoTip extends HTMLElement {
  constructor() {
    super();
    this._open = false;
    this._onOutsideClick = this._onOutsideClick.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);
  }

  connectedCallback() {
    this.innerHTML = `<span class="info-tip-trigger" aria-label="More info" tabindex="0">?</span><span class="info-tip-popover" role="tooltip">${this._esc(this.getAttribute('text') || '')}</span>`;
    const trigger = this.querySelector('.info-tip-trigger');
    const popover = this.querySelector('.info-tip-popover');

    // Desktop: hover
    trigger.addEventListener('mouseenter', () => this._show(popover));
    this.addEventListener('mouseleave', () => this._hide(popover));

    // Mobile: tap toggle
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._open) {
        this._hide(popover);
      } else {
        this._show(popover);
      }
    });

    // Keyboard: Enter/Space
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (this._open) this._hide(popover);
        else this._show(popover);
      }
    });
  }

  _show(popover) {
    this._open = true;
    popover.classList.add('info-tip-visible');
    document.addEventListener('click', this._onOutsideClick, true);
  }

  _hide(popover) {
    this._open = false;
    popover.classList.remove('info-tip-visible');
    document.removeEventListener('click', this._onOutsideClick, true);
  }

  _onOutsideClick(e) {
    if (!this.contains(e.target)) {
      const popover = this.querySelector('.info-tip-popover');
      if (popover) this._hide(popover);
    }
  }

  _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  disconnectedCallback() {
    document.removeEventListener('click', this._onOutsideClick, true);
  }
}

customElements.define('info-tip', InfoTip);
