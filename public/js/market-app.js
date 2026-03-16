// Market Overview page logic — heatmap, sector breakdown, top movers
(function () {
  'use strict';

  // Sector classification for known tokens
  var SECTORS = {
    // Layer 1
    btc: 'L1', eth: 'L1', sol: 'L1', ada: 'L1', avax: 'L1', dot: 'L1',
    atom: 'L1', near: 'L1', apt: 'L1', sui: 'L1', ton: 'L1', trx: 'L1',
    xlm: 'L1', algo: 'L1', hbar: 'L1', eos: 'L1', xtz: 'L1', icp: 'L1',
    ftm: 'L1', kas: 'L1', sei: 'L1',
    // Layer 2
    matic: 'L2', arb: 'L2', op: 'L2', imx: 'L2', mnt: 'L2', strk: 'L2',
    // DeFi
    uni: 'DeFi', aave: 'DeFi', link: 'DeFi', mkr: 'DeFi', snx: 'DeFi',
    crv: 'DeFi', comp: 'DeFi', ldo: 'DeFi', pendle: 'DeFi', '1inch': 'DeFi',
    cake: 'DeFi', sushi: 'DeFi', gmx: 'DeFi', dydx: 'DeFi', rpl: 'DeFi',
    jup: 'DeFi', ray: 'DeFi',
    // Meme
    doge: 'Meme', shib: 'Meme', pepe: 'Meme', floki: 'Meme', bonk: 'Meme',
    wif: 'Meme', meme: 'Meme',
    // Stablecoin
    usdt: 'Stable', usdc: 'Stable', dai: 'Stable', busd: 'Stable',
    tusd: 'Stable', frax: 'Stable',
    // Exchange
    bnb: 'Exchange', okb: 'Exchange', cro: 'Exchange', leo: 'Exchange',
    // Infrastructure
    fil: 'Infra', ar: 'Infra', render: 'Infra', theta: 'Infra', grt: 'Infra',
    rndr: 'Infra',
    // Gaming / Metaverse
    axs: 'Gaming', sand: 'Gaming', mana: 'Gaming', gala: 'Gaming', enj: 'Gaming',
  };

  var t = window.i18n ? window.i18n.t : function(k) { return k; };

  var SECTOR_LABELS = {
    L1: t('market.sectorL1') || 'Layer 1',
    L2: t('market.sectorL2') || 'Layer 2',
    DeFi: 'DeFi',
    Meme: 'Meme',
    Stable: t('market.sectorStable') || 'Stablecoin',
    Exchange: 'Exchange',
    Infra: t('market.sectorInfra') || 'Infrastructure',
    Gaming: 'Gaming',
    Other: t('market.sectorOther') || 'Other'
  };

  var SECTOR_COLORS = {
    L1: '#58a6ff',
    L2: '#a371f7',
    DeFi: '#3fb950',
    Meme: '#d29922',
    Stable: '#8b949e',
    Exchange: '#f0883e',
    Infra: '#79c0ff',
    Gaming: '#f778ba',
    Other: '#6e7681'
  };

  function getSector(symbol) {
    return SECTORS[symbol.toLowerCase()] || 'Other';
  }

  function formatPrice(price) {
    if (price >= 1) return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price >= 0.01) return '$' + price.toFixed(4);
    return '$' + price.toFixed(6);
  }

  function formatMarketCap(mc) {
    if (!mc) return '—';
    if (mc >= 1e12) return '$' + (mc / 1e12).toFixed(2) + 'T';
    if (mc >= 1e9) return '$' + (mc / 1e9).toFixed(2) + 'B';
    if (mc >= 1e6) return '$' + (mc / 1e6).toFixed(1) + 'M';
    return '$' + mc.toLocaleString('en-US');
  }

  function formatChange(pct) {
    if (pct == null) return '—';
    var sign = pct >= 0 ? '+' : '';
    return sign + pct.toFixed(2) + '%';
  }

  function changeClass(pct) {
    if (pct == null) return '';
    return pct >= 0 ? 'change-positive' : 'change-negative';
  }

  // Heatmap color: green for positive, red for negative, intensity by magnitude
  function heatColor(pct) {
    if (pct == null) return 'rgba(110,118,129,0.3)';
    var clamped = Math.max(-15, Math.min(15, pct));
    var intensity = Math.abs(clamped) / 15;
    if (pct >= 0) {
      // green
      var r = Math.round(13 + (63 - 13) * (1 - intensity));
      var g = Math.round(17 + (185 - 17) * intensity * 0.6 + 50);
      var b = Math.round(34 + (80 - 34) * (1 - intensity));
      return 'rgba(63,185,80,' + (0.15 + intensity * 0.55) + ')';
    } else {
      // red
      return 'rgba(248,81,73,' + (0.15 + intensity * 0.55) + ')';
    }
  }

  // Size weighting for heatmap tiles (based on market cap rank)
  function tileSize(rank, total) {
    if (rank <= 3) return 'heatmap-tile-xl';
    if (rank <= 10) return 'heatmap-tile-lg';
    if (rank <= 25) return 'heatmap-tile-md';
    return 'heatmap-tile-sm';
  }

  function renderHeatmap(tokens) {
    var container = document.getElementById('heatmap');
    if (!container) return;

    // Filter out stablecoins from heatmap (boring 0% changes)
    var filtered = tokens.filter(function (t) { return getSector(t.symbol) !== 'Stable'; });

    var html = '<div class="heatmap-grid">';
    filtered.forEach(function (t, i) {
      var pct = t.price_change_percentage_24h;
      var size = tileSize(i + 1, filtered.length);
      html += '<a href="/tokens/' + t.symbol + '" class="heatmap-tile ' + size + '" style="background:' + heatColor(pct) + '">';
      html += '<span class="heatmap-symbol">' + t.symbol.toUpperCase() + '</span>';
      html += '<span class="heatmap-change ' + changeClass(pct) + '">' + formatChange(pct) + '</span>';
      html += '</a>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  function renderSectors(tokens) {
    var container = document.getElementById('sectors');
    if (!container) return;

    // Group by sector
    var sectors = {};
    tokens.forEach(function (t) {
      var sec = getSector(t.symbol);
      if (!sectors[sec]) sectors[sec] = { tokens: [], totalMcap: 0, weightedChange: 0, totalWeight: 0 };
      sectors[sec].tokens.push(t);
      var mcap = t.market_cap || 0;
      sectors[sec].totalMcap += mcap;
      if (t.price_change_percentage_24h != null && mcap > 0) {
        sectors[sec].weightedChange += t.price_change_percentage_24h * mcap;
        sectors[sec].totalWeight += mcap;
      }
    });

    // Sort by total market cap
    var sorted = Object.keys(sectors).sort(function (a, b) {
      return sectors[b].totalMcap - sectors[a].totalMcap;
    });

    var html = '<div class="sector-grid">';
    sorted.forEach(function (key) {
      var sec = sectors[key];
      var avgChange = sec.totalWeight > 0 ? sec.weightedChange / sec.totalWeight : 0;
      var label = SECTOR_LABELS[key] || key;
      var color = SECTOR_COLORS[key] || '#6e7681';

      html += '<div class="sector-card">';
      html += '<div class="sector-header">';
      html += '<span class="sector-dot" style="background:' + color + '"></span>';
      html += '<span class="sector-name">' + label + '</span>';
      html += '<span class="sector-count">' + sec.tokens.length + ' ' + (t('market.tokens') || 'tokens') + '</span>';
      html += '</div>';
      html += '<div class="sector-stats">';
      html += '<div class="sector-mcap">' + formatMarketCap(sec.totalMcap) + '</div>';
      html += '<div class="sector-change ' + changeClass(avgChange) + '">' + formatChange(avgChange) + '</div>';
      html += '</div>';
      // Top 3 tokens in sector
      html += '<div class="sector-tokens">';
      sec.tokens.slice(0, 3).forEach(function (t) {
        var pct = t.price_change_percentage_24h;
        html += '<a href="/tokens/' + t.symbol + '" class="sector-token">';
        html += '<span>' + t.symbol.toUpperCase() + '</span>';
        html += '<span class="' + changeClass(pct) + '">' + formatChange(pct) + '</span>';
        html += '</a>';
      });
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
  }

  function renderMovers(tokens) {
    var moversContainer = document.getElementById('top-movers');
    var losersContainer = document.getElementById('top-losers');
    if (!moversContainer || !losersContainer) return;

    // Filter tokens with valid change data, exclude stablecoins
    var withChange = tokens.filter(function (t) {
      return t.price_change_percentage_24h != null && getSector(t.symbol) !== 'Stable';
    });

    var sorted = withChange.slice().sort(function (a, b) {
      return b.price_change_percentage_24h - a.price_change_percentage_24h;
    });

    var gainers = sorted.slice(0, 10);
    var losers = sorted.slice(-10).reverse();

    moversContainer.innerHTML = renderRankingTable(gainers, 'gainer');
    losersContainer.innerHTML = renderRankingTable(losers, 'loser');
  }

  function renderRankingTable(list, type) {
    var html = '<div class="ranking-list">';
    list.forEach(function (t, i) {
      var pct = t.price_change_percentage_24h;
      html += '<a href="/tokens/' + t.symbol + '" class="ranking-row">';
      html += '<span class="ranking-rank">' + (i + 1) + '</span>';
      html += '<div class="ranking-info">';
      html += '<span class="ranking-symbol">' + t.symbol.toUpperCase() + '</span>';
      html += '<span class="ranking-name">' + t.name + '</span>';
      html += '</div>';
      html += '<span class="ranking-price">' + formatPrice(t.price_usd) + '</span>';
      html += '<span class="ranking-change ' + changeClass(pct) + '">' + formatChange(pct) + '</span>';
      html += '</a>';
    });
    html += '</div>';
    return html;
  }

  function renderLastUpdated(tokens) {
    var el = document.getElementById('last-updated');
    if (!el || !tokens.length) return;
    var latest = tokens[0].fetched_at;
    if (latest) {
      var d = new Date(latest + (latest.endsWith('Z') ? '' : 'Z'));
      el.textContent = 'Last updated: ' + d.toLocaleTimeString();
    }
  }

  // Load data and render
  function init() {
    fetch('/api/prices?sort=market_cap&order=desc')
      .then(function (r) { return r.json(); })
      .then(function (result) {
        var tokens = result.data || [];
        if (!tokens.length) {
          document.getElementById('heatmap').innerHTML = '<div class="market-empty">' + (t('market.noData') || 'No price data available yet.') + '</div>';
          return;
        }

        renderHeatmap(tokens);
        renderSectors(tokens);
        renderMovers(tokens);
        renderLastUpdated(tokens);
      })
      .catch(function (err) {
        console.error('Failed to load market data:', err);
        document.getElementById('heatmap').innerHTML = '<div class="market-empty">' + (t('market.loadFailed') || 'Failed to load market data.') + '</div>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
