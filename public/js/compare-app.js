// Token Comparison page application
(function () {
  'use strict';

  var CHART_COLORS = [
    { line: '#1f6feb', up: '#3fb950', down: '#f85149', label: 'Token A' },
    { line: '#d29922', up: '#d29922', down: '#da3633', label: 'Token B' },
    { line: '#a371f7', up: '#a371f7', down: '#f778ba', label: 'Token C' },
  ];

  var RANGE_LIMITS = { '1d': 24, '1w': 168, '1m': 720, '3m': 2160 };

  var selectedTokens = [null, null, null]; // { symbol, name }
  var tokenPriceData = {}; // symbol -> raw price array
  var tokenLatest = {};    // symbol -> latest price row
  var tokenImpact = {};    // symbol -> impact data
  var charts = [];
  var currentRange = '1m';

  // --- Token picker ---
  var slots = document.querySelectorAll('.picker-slot');
  var btnCompare = document.getElementById('btn-compare');
  var btnShare = document.getElementById('btn-share');

  slots.forEach(function (slot) {
    var input = slot.querySelector('.picker-input');
    var dropdown = slot.querySelector('.picker-dropdown');
    var selectedEl = slot.querySelector('.picker-selected');
    var slotIdx = parseInt(slot.dataset.slot, 10);
    var debounce = null;

    input.addEventListener('input', function () {
      clearTimeout(debounce);
      var q = input.value.trim();
      if (q.length < 1) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; return; }
      debounce = setTimeout(function () { searchTokens(q, dropdown, slotIdx); }, 200);
    });

    input.addEventListener('focus', function () {
      if (input.value.trim().length >= 1) {
        searchTokens(input.value.trim(), dropdown, slotIdx);
      }
    });

    // Close dropdown on outside click
    document.addEventListener('click', function (e) {
      if (!slot.contains(e.target)) { dropdown.style.display = 'none'; }
    });
  });

  async function searchTokens(q, dropdown, slotIdx) {
    try {
      var res = await fetch('/api/search?q=' + encodeURIComponent(q));
      if (!res.ok) return;
      var body = await res.json();
      var tokens = (body.data && body.data.tokens) || body.tokens || [];
      if (tokens.length === 0) {
        dropdown.innerHTML = '<div class="picker-item picker-empty">No tokens found</div>';
        dropdown.style.display = 'block';
        return;
      }
      // Filter out already-selected tokens
      var alreadySelected = selectedTokens.filter(Boolean).map(function (t) { return t.symbol; });
      var filtered = tokens.filter(function (t) { return alreadySelected.indexOf(t.symbol) === -1; });
      if (filtered.length === 0) {
        dropdown.innerHTML = '<div class="picker-item picker-empty">All matching tokens already selected</div>';
        dropdown.style.display = 'block';
        return;
      }
      dropdown.innerHTML = filtered.slice(0, 8).map(function (t) {
        return '<div class="picker-item" data-symbol="' + escHtml(t.symbol) + '" data-name="' + escHtml(t.name) + '">'
          + '<span class="picker-item-symbol">' + escHtml(t.symbol.toUpperCase()) + '</span>'
          + '<span class="picker-item-name">' + escHtml(t.name) + '</span>'
          + '</div>';
      }).join('');
      dropdown.style.display = 'block';

      // Click handlers
      dropdown.querySelectorAll('.picker-item[data-symbol]').forEach(function (item) {
        item.addEventListener('click', function () {
          selectToken(slotIdx, item.dataset.symbol, item.dataset.name);
          dropdown.style.display = 'none';
        });
      });
    } catch (err) {
      console.error('[compare] search error:', err);
    }
  }

  function selectToken(slotIdx, symbol, name) {
    selectedTokens[slotIdx] = { symbol: symbol, name: name };
    var slot = slots[slotIdx];
    var input = slot.querySelector('.picker-input');
    var selectedEl = slot.querySelector('.picker-selected');
    input.style.display = 'none';
    selectedEl.innerHTML = '<span class="picker-chip">'
      + '<span class="picker-chip-symbol">' + escHtml(symbol.toUpperCase()) + '</span>'
      + '<span class="picker-chip-name">' + escHtml(name) + '</span>'
      + '<button class="picker-chip-remove" title="Remove">&times;</button>'
      + '</span>';
    selectedEl.style.display = 'block';

    selectedEl.querySelector('.picker-chip-remove').addEventListener('click', function () {
      removeToken(slotIdx);
    });

    updateCompareButton();
  }

  function removeToken(slotIdx) {
    selectedTokens[slotIdx] = null;
    var slot = slots[slotIdx];
    var input = slot.querySelector('.picker-input');
    var selectedEl = slot.querySelector('.picker-selected');
    input.style.display = '';
    input.value = '';
    selectedEl.innerHTML = '';
    selectedEl.style.display = 'none';
    updateCompareButton();
  }

  function updateCompareButton() {
    var count = selectedTokens.filter(Boolean).length;
    btnCompare.disabled = count < 2;
  }

  btnCompare.addEventListener('click', function () {
    runComparison();
  });

  btnShare.addEventListener('click', function () {
    var symbols = selectedTokens.filter(Boolean).map(function (t) { return t.symbol; });
    if (symbols.length < 2) return;
    var url = window.location.origin + '/compare?tokens=' + symbols.join(',');
    navigator.clipboard.writeText(url).then(function () {
      var toast = document.getElementById('copy-toast');
      toast.classList.add('show');
      setTimeout(function () { toast.classList.remove('show'); }, 2000);
    });
  });

  // --- Time range selector ---
  document.querySelectorAll('.compare-time-range .range-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.compare-time-range .range-btn').forEach(function (b) {
        b.classList.remove('active');
        b.classList.remove('range-btn-pop');
      });
      btn.classList.add('active');
      btn.classList.add('range-btn-pop');
      currentRange = btn.dataset.range;
      renderAllCharts();
    });
  });

  // --- Run comparison ---
  async function runComparison() {
    var tokens = selectedTokens.filter(Boolean);
    if (tokens.length < 2) return;

    // Update URL without reload
    var symbols = tokens.map(function (t) { return t.symbol; });
    var url = '/compare?tokens=' + symbols.join(',');
    window.history.replaceState(null, '', url);

    document.getElementById('compare-time-range').style.display = '';

    // Show loading in charts area
    var chartsContainer = document.getElementById('compare-charts');
    chartsContainer.innerHTML = '<div class="loading-state"><span class="spinner"></span>Loading comparison data...</div>';
    document.getElementById('compare-metrics').innerHTML = '';
    document.getElementById('compare-impact').innerHTML = '';
    document.getElementById('compare-news').innerHTML = '';

    // Fetch all data in parallel
    await Promise.all(tokens.map(async function (t) {
      var sym = t.symbol;
      try {
        var [priceRes, tokenRes, impactRes] = await Promise.all([
          fetch('/api/prices/' + encodeURIComponent(sym) + '/history?limit=2200'),
          fetch('/api/tokens/' + encodeURIComponent(sym)),
          fetch('/api/tokens/' + encodeURIComponent(sym) + '/impact'),
        ]);

        if (priceRes.ok) {
          var priceBody = await priceRes.json();
          tokenPriceData[sym] = priceBody.data || [];
        }
        if (tokenRes.ok) {
          var tokenBody = await tokenRes.json();
          if (tokenBody.data && tokenBody.data.price) {
            tokenLatest[sym] = tokenBody.data.price;
          }
        }
        if (impactRes.ok) {
          var impactBody = await impactRes.json();
          tokenImpact[sym] = impactBody.data || {};
        }
      } catch (err) {
        console.error('[compare] Failed to load data for', sym, err);
      }
    }));

    renderAllCharts();
    renderMetrics();
    renderImpactComparison();
    renderNewsLinks();
  }

  // --- Charts ---
  function renderAllCharts() {
    var tokens = selectedTokens.filter(Boolean);
    var container = document.getElementById('compare-charts');
    container.innerHTML = '';

    // Destroy old charts
    charts.forEach(function (c) { if (c) c.remove(); });
    charts = [];

    // Create a chart for each token
    var grid = document.createElement('div');
    grid.className = 'compare-charts-grid compare-charts-grid-' + tokens.length;
    container.appendChild(grid);

    tokens.forEach(function (t, i) {
      var wrapper = document.createElement('div');
      wrapper.className = 'compare-chart-wrapper';

      var header = document.createElement('div');
      header.className = 'compare-chart-header';
      var latest = tokenLatest[t.symbol];
      var priceHtml = '';
      if (latest) {
        var pct = latest.price_change_percentage_24h || 0;
        var sign = pct >= 0 ? '+' : '';
        var cls = pct >= 0 ? 'change-positive' : 'change-negative';
        priceHtml = '<span class="compare-chart-price">$' + fmtPrice(latest.price_usd) + '</span>'
          + '<span class="compare-chart-change ' + cls + '">' + sign + pct.toFixed(2) + '%</span>';
      }
      header.innerHTML = '<div class="compare-chart-title">'
        + '<span class="compare-chart-dot" style="background:' + CHART_COLORS[i].line + '"></span>'
        + '<span class="compare-chart-symbol">' + escHtml(t.symbol.toUpperCase()) + '</span>'
        + '<span class="compare-chart-name">' + escHtml(t.name) + '</span>'
        + '</div>'
        + '<div class="compare-chart-stats">' + priceHtml + '</div>';

      var chartEl = document.createElement('div');
      chartEl.className = 'compare-chart-target';

      wrapper.appendChild(header);
      wrapper.appendChild(chartEl);
      grid.appendChild(wrapper);

      var data = tokenPriceData[t.symbol] || [];
      var limit = RANGE_LIMITS[currentRange] || 720;
      var filtered = data.slice(0, limit);

      if (filtered.length === 0) {
        chartEl.innerHTML = '<div class="placeholder">No data available</div>';
        charts.push(null);
        return;
      }

      var colors = getChartThemeColors();
      var chartHeight = window.innerWidth <= 480 ? 220 : 300;
      var chart = LightweightCharts.createChart(chartEl, {
        width: chartEl.clientWidth,
        height: chartHeight,
        layout: { background: { color: colors.bg }, textColor: colors.text },
        grid: { vertLines: { color: colors.grid }, horzLines: { color: colors.grid } },
        crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
        rightPriceScale: { borderColor: colors.border },
        timeScale: { borderColor: colors.border, timeVisible: true },
      });

      var candles = toCandles(filtered, 3600);
      if (candles.length > 1) {
        var series = chart.addCandlestickSeries({
          upColor: CHART_COLORS[i].up,
          downColor: CHART_COLORS[i].down,
          borderDownColor: CHART_COLORS[i].down,
          borderUpColor: CHART_COLORS[i].up,
          wickDownColor: CHART_COLORS[i].down,
          wickUpColor: CHART_COLORS[i].up,
        });
        series.setData(candles);
      } else {
        var lineSeries = chart.addLineSeries({ color: CHART_COLORS[i].line, lineWidth: 2 });
        var lineData = filtered
          .map(function (d) { return { time: Math.floor(new Date(d.fetched_at).getTime() / 1000), value: d.price_usd }; })
          .sort(function (a, b) { return a.time - b.time; });
        lineSeries.setData(lineData);
      }

      chart.timeScale().fitContent();
      charts.push(chart);

      var ro = new ResizeObserver(function () {
        chart.applyOptions({ width: chartEl.clientWidth });
      });
      ro.observe(chartEl);
    });
  }

  // --- Metrics comparison table ---
  function renderMetrics() {
    var tokens = selectedTokens.filter(Boolean);
    var container = document.getElementById('compare-metrics');

    var rows = [
      { label: 'Price', key: 'price_usd', fmt: function (v) { return '$' + fmtPrice(v); } },
      { label: '24h Change', key: 'price_change_percentage_24h', fmt: function (v) {
        if (v == null) return '—';
        var sign = v >= 0 ? '+' : '';
        return sign + v.toFixed(2) + '%';
      }, cls: function (v) { return v >= 0 ? 'change-positive' : 'change-negative'; } },
      { label: 'Market Cap', key: 'market_cap', fmt: function (v) { return v ? '$' + fmtLargeNum(v) : '—'; } },
      { label: 'Volume (24h)', key: 'total_volume', fmt: function (v) { return v ? '$' + fmtLargeNum(v) : '—'; } },
    ];

    var headerCells = tokens.map(function (t, i) {
      return '<th><span class="compare-chart-dot" style="background:' + CHART_COLORS[i].line + '"></span> ' + escHtml(t.symbol.toUpperCase()) + '</th>';
    }).join('');

    var bodyRows = rows.map(function (row) {
      var cells = tokens.map(function (t) {
        var latest = tokenLatest[t.symbol];
        var val = latest ? latest[row.key] : null;
        var cellCls = row.cls ? row.cls(val) : '';
        return '<td class="' + cellCls + '">' + row.fmt(val) + '</td>';
      }).join('');
      return '<tr><td class="metric-label">' + row.label + '</td>' + cells + '</tr>';
    }).join('');

    container.innerHTML = '<div class="section-header"><h2>Key Metrics</h2></div>'
      + '<div class="compare-table-wrap"><table class="compare-table">'
      + '<thead><tr><th></th>' + headerCells + '</tr></thead>'
      + '<tbody>' + bodyRows + '</tbody>'
      + '</table></div>';
  }

  // --- Impact comparison ---
  function renderImpactComparison() {
    var tokens = selectedTokens.filter(Boolean);
    var container = document.getElementById('compare-impact');

    // Collect all categories across tokens
    var allCategories = {};
    tokens.forEach(function (t) {
      var imp = tokenImpact[t.symbol];
      if (imp && imp.categories) {
        imp.categories.forEach(function (c) {
          allCategories[c.category] = true;
        });
      }
    });

    var categories = Object.keys(allCategories);
    if (categories.length === 0) {
      container.innerHTML = '<div class="section-header"><h2>News Impact Comparison</h2></div>'
        + '<p class="loading-state">No impact data available for selected tokens.</p>';
      return;
    }

    var headerCells = tokens.map(function (t, i) {
      return '<th><span class="compare-chart-dot" style="background:' + CHART_COLORS[i].line + '"></span> ' + escHtml(t.symbol.toUpperCase()) + '</th>';
    }).join('');

    var bodyRows = categories.map(function (cat) {
      var cells = tokens.map(function (t) {
        var imp = tokenImpact[t.symbol];
        var catData = null;
        if (imp && imp.categories) {
          catData = imp.categories.find(function (c) { return c.category === cat; });
        }
        if (!catData) return '<td class="text-muted">—</td>';
        var avg = catData.avgChange24h || 0;
        var sign = avg >= 0 ? '+' : '';
        var cls = avg > 0.1 ? 'change-positive' : avg < -0.1 ? 'change-negative' : '';
        return '<td class="' + cls + '">' + sign + avg.toFixed(2) + '% <span class="text-muted">(' + catData.sampleSize + ')</span></td>';
      }).join('');
      return '<tr><td class="metric-label">' + escHtml(cat) + '</td>' + cells + '</tr>';
    }).join('');

    container.innerHTML = '<div class="section-header"><h2>News Impact Comparison</h2><span class="section-meta">Avg 24h price change by news category</span></div>'
      + '<div class="compare-table-wrap"><table class="compare-table">'
      + '<thead><tr><th>Category</th>' + headerCells + '</tr></thead>'
      + '<tbody>' + bodyRows + '</tbody>'
      + '</table></div>';
  }

  // --- News links ---
  function renderNewsLinks() {
    var tokens = selectedTokens.filter(Boolean);
    var container = document.getElementById('compare-news');

    var links = tokens.map(function (t, i) {
      return '<a href="/tokens/' + encodeURIComponent(t.symbol) + '" class="compare-news-link">'
        + '<span class="compare-chart-dot" style="background:' + CHART_COLORS[i].line + '"></span>'
        + '<span>' + escHtml(t.symbol.toUpperCase()) + ' — View full news & analysis</span>'
        + '<span class="compare-news-arrow">&rarr;</span>'
        + '</a>';
    }).join('');

    container.innerHTML = '<div class="section-header"><h2>Detailed Analysis</h2></div>'
      + '<div class="compare-news-links">' + links + '</div>';
  }

  /** Read current theme colors from CSS custom properties */
  function getChartThemeColors() {
    var s = getComputedStyle(document.documentElement);
    return {
      bg: s.getPropertyValue('--bg-secondary').trim() || '#161b22',
      text: s.getPropertyValue('--text-secondary').trim() || '#8b949e',
      grid: s.getPropertyValue('--bg-tertiary').trim() || '#21262d',
      border: s.getPropertyValue('--border').trim() || '#30363d',
    };
  }

  // --- Utilities ---
  function toCandles(data, intervalSec) {
    var buckets = new Map();
    for (var j = 0; j < data.length; j++) {
      var d = data[j];
      var ts = Math.floor(new Date(d.fetched_at).getTime() / 1000);
      var bucket = Math.floor(ts / intervalSec) * intervalSec;
      if (!buckets.has(bucket)) {
        buckets.set(bucket, { time: bucket, open: d.price_usd, high: d.price_usd, low: d.price_usd, close: d.price_usd });
      } else {
        var c = buckets.get(bucket);
        c.high = Math.max(c.high, d.price_usd);
        c.low = Math.min(c.low, d.price_usd);
        c.close = d.price_usd;
      }
    }
    return Array.from(buckets.values()).sort(function (a, b) { return a.time - b.time; });
  }

  function fmtPrice(n) {
    if (n == null) return '—';
    if (n >= 1) return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  }

  function fmtLargeNum(n) {
    if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    return Number(n).toLocaleString();
  }

  function escHtml(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // --- URL-driven init ---
  (function init() {
    var params = new URLSearchParams(window.location.search);
    var tokensParam = params.get('tokens');
    if (!tokensParam) return;

    var symbols = tokensParam.split(',').filter(Boolean).slice(0, 3);
    if (symbols.length < 2) return;

    // Auto-fill from URL
    Promise.all(symbols.map(function (sym, i) {
      return fetch('/api/tokens/' + encodeURIComponent(sym))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (body) {
          if (body && body.data && body.data.token) {
            selectToken(i, body.data.token.symbol, body.data.token.name);
          }
        })
        .catch(function () {});
    })).then(function () {
      var count = selectedTokens.filter(Boolean).length;
      if (count >= 2) {
        runComparison();
      }
    });
  })();
})();
