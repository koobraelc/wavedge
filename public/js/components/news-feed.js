class NewsFeed extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="news-grid" id="news-grid">
        ${this._skeletonCards(5)}
      </div>
    `;
  }

  update(articles) {
    const grid = this.querySelector('#news-grid');
    if (!articles.length) {
      grid.innerHTML = '<div class="loading-state">No articles yet</div>';
      return;
    }

    grid.innerHTML = articles.map(a => this._renderCard(a)).join('');
  }

  _renderCard(article) {
    const tags = this._parseTags(article.token_tags);
    const time = this._relativeTime(article.published_at);
    const fullTime = this._fullTime(article.published_at);

    return `
      <article class="news-card">
        <div class="news-title">
          <a href="${this._esc(article.url)}" target="_blank" rel="noopener">${this._esc(article.title)}</a>
        </div>
        ${article.summary ? `<div class="news-summary">${this._esc(article.summary.slice(0, 200))}</div>` : ''}
        <div class="news-meta">
          <span class="source">${this._esc(article.source)}</span>
          <span>·</span>
          <span class="time-relative">${time}<span class="time-tooltip">${this._esc(fullTime)}</span></span>
          ${tags.length ? '<span>·</span>' + tags.map(t => `<span class="token-tag">${this._esc(t)}</span>`).join(' ') : ''}
          ${article._impact ? this._renderImpact(article._impact) : ''}
        </div>
      </article>
    `;
  }

  _renderImpact(impact) {
    if (!impact || !impact.tokenImpacts || !impact.tokenImpacts.length) return '';
    const first = impact.tokenImpacts[0];
    if (!first.historical || first.historical.sampleSize < 1) return '';

    const avg24h = first.historical.avgChange24h;
    if (avg24h == null) return '';

    const cls = avg24h > 0.1 ? 'positive' : avg24h < -0.1 ? 'negative' : 'neutral';
    const sign = avg24h > 0 ? '+' : '';
    const cat = impact.category || '';
    const samples = first.historical.sampleSize;
    const tooltipText = `${cat ? cat + ' news: ' : ''}Historical avg 24h price change based on ${samples} similar event${samples > 1 ? 's' : ''}`;

    return `
      <span>·</span>
      <span class="impact-badge ${cls}">
        ${cat ? '<span class="category-badge">' + this._esc(cat) + '</span> ' : ''}${sign}${avg24h.toFixed(2)}% avg
        <span class="impact-tooltip">${this._esc(tooltipText)}</span>
      </span>
    `;
  }

  _skeletonCards(count) {
    let cards = '';
    for (let i = 0; i < count; i++) {
      const titleW = 55 + Math.random() * 30;
      const summaryW = 70 + Math.random() * 20;
      cards += `
        <div class="news-card-skeleton">
          <div class="skeleton skel-title" style="width:${titleW}%"></div>
          <div class="skeleton skel-summary" style="width:${summaryW}%"></div>
          <div class="skeleton skel-summary-2"></div>
          <div class="skeleton skel-meta"></div>
        </div>
      `;
    }
    return cards;
  }

  _parseTags(raw) {
    if (!raw || raw === '[]') return [];
    try { return JSON.parse(raw); } catch { return []; }
  }

  _relativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  _fullTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

customElements.define('news-feed', NewsFeed);
