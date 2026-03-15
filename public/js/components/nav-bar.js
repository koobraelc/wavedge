class NavBar extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <header class="app-header">
        <div class="logo">Wave<span>edge</span></div>
        <div class="search-box">
          <input type="search" placeholder="Search tokens or news..." aria-label="Search" />
        </div>
        <nav class="header-nav">
          <a href="/" aria-current="page">Dashboard</a>
        </nav>
      </header>
    `;

    const input = this.querySelector('input');
    let debounce;
    input.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        this.dispatchEvent(new CustomEvent('nav-search', {
          bubbles: true,
          detail: { query: input.value.trim() }
        }));
      }, 300);
    });
  }
}

customElements.define('nav-bar', NavBar);
