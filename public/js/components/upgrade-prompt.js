class UpgradePrompt extends HTMLElement {
  connectedCallback() {
    const feature = this.getAttribute('feature') || 'this feature';
    const limit = this.getAttribute('limit') || '';

    this.innerHTML = `
      <div class="upgrade-prompt">
        <h3>Upgrade to Pro</h3>
        <p>${limit ? limit + ' — ' : ''}Unlock ${this.escapeHtml(feature)} and more with Wavedge Pro.</p>
        <a href="/billing" class="btn-primary">Upgrade — $19/mo</a>
      </div>
    `;
  }

  escapeHtml(str) {
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }
}

customElements.define('upgrade-prompt', UpgradePrompt);
