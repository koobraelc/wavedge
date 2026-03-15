class NewsFeed extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="news-grid" id="news-grid">
        <div class="loading-state"><span class="spinner"></span>Loading news...</div>
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

    return `
      <article class="news-card">
        <div class="news-title">
          <a href="${this._esc(article.url)}" target="_blank" rel="noopener">${this._esc(article.title)}</a>
        </div>
        ${article.summary ? `<div class="news-summary">${this._esc(article.summary.slice(0, 200))}</div>` : ''}
        <div class="news-meta">
          <span class="source">${this._esc(article.source)}</span>
          <span>·</span>
          <span>${time}</span>
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

    return `
      <span>·</span>
      <span class="impact-badge ${cls}" title="${this._esc(cat)} news: historical avg 24h change">
        ${cat ? '<span class="category-badge">' + this._esc(cat) + '</span> ' : ''}${sign}${avg24h.toFixed(2)}% avg
      </span>
    `;
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

  _esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}

customElements.define('news-feed', NewsFeed);
