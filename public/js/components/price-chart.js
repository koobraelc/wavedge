class PriceChart extends HTMLElement {
  constructor() {
    super();
    this._chart = null;
    this._series = null;
  }

  connectedCallback() {
    this.innerHTML = `
      <div class="chart-section">
        <div class="chart-header">
          <div class="chart-token-info">
            <h2 id="chart-title">Select a token to view chart</h2>
            <span class="price" id="chart-price"></span>
            <span class="change" id="chart-change"></span>
          </div>
        </div>
        <div class="chart-container" id="chart-target">
          <div class="placeholder">Click a token row to load its price chart</div>
        </div>
      </div>
    `;
  }

  async loadToken(symbol, currentPrice) {
    const container = this.querySelector('#chart-target');
    const titleEl = this.querySelector('#chart-title');
    const priceEl = this.querySelector('#chart-price');
    const changeEl = this.querySelector('#chart-change');

    titleEl.textContent = symbol.toUpperCase() + ' Price';
    if (currentPrice) {
      priceEl.textContent = '$' + this._fmtPrice(currentPrice.price_usd);
      const pct = currentPrice.price_change_percentage_24h ?? 0;
      const sign = pct >= 0 ? '+' : '';
      changeEl.textContent = `${sign}${pct.toFixed(2)}%`;
      changeEl.className = 'change ' + (pct >= 0 ? 'change-positive' : 'change-negative');
    }

    container.innerHTML = '<div class="placeholder"><span class="spinner"></span>Loading chart...</div>';

    try {
      const res = await fetch(`/api/prices/${encodeURIComponent(symbol)}/history?limit=500`);
      if (!res.ok) throw new Error('Failed to load history');
      const { data } = await res.json();

      if (!data || data.length === 0) {
        container.innerHTML = '<div class="placeholder">No historical data available</div>';
        return;
      }

      container.innerHTML = '';
      this._renderChart(container, data);
    } catch (err) {
      container.innerHTML = `<div class="placeholder">Failed to load chart data</div>`;
    }
  }

  _renderChart(container, data) {
    if (this._chart) {
      this._chart.remove();
      this._chart = null;
    }

    const chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: 300,
      layout: {
        background: { color: '#161b22' },
        textColor: '#8b949e',
      },
      grid: {
        vertLines: { color: '#21262d' },
        horzLines: { color: '#21262d' },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: '#30363d',
      },
      timeScale: {
        borderColor: '#30363d',
        timeVisible: true,
      },
    });

    // Group data into OHLC candles (1h)
    const candles = this._toCandles(data, 3600);

    if (candles.length > 1) {
      const candleSeries = chart.addSeries(
        LightweightCharts.CandlestickSeries,
        {
          upColor: '#3fb950',
          downColor: '#f85149',
          borderDownColor: '#f85149',
          borderUpColor: '#3fb950',
          wickDownColor: '#f85149',
          wickUpColor: '#3fb950',
        }
      );
      candleSeries.setData(candles);
      this._series = candleSeries;
    } else {
      // Not enough data for candles, show line
      const lineSeries = chart.addSeries(
        LightweightCharts.LineSeries,
        {
          color: '#1f6feb',
          lineWidth: 2,
        }
      );
      const lineData = data
        .map(d => ({
          time: Math.floor(new Date(d.fetched_at).getTime() / 1000),
          value: d.price_usd,
        }))
        .sort((a, b) => a.time - b.time);
      lineSeries.setData(lineData);
      this._series = lineSeries;
    }

    chart.timeScale().fitContent();
    this._chart = chart;

    // Resize observer
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    ro.observe(container);
  }

  _toCandles(data, intervalSec) {
    const buckets = new Map();

    for (const d of data) {
      const ts = Math.floor(new Date(d.fetched_at).getTime() / 1000);
      const bucket = Math.floor(ts / intervalSec) * intervalSec;
      if (!buckets.has(bucket)) {
        buckets.set(bucket, { time: bucket, open: d.price_usd, high: d.price_usd, low: d.price_usd, close: d.price_usd });
      } else {
        const c = buckets.get(bucket);
        c.high = Math.max(c.high, d.price_usd);
        c.low = Math.min(c.low, d.price_usd);
        c.close = d.price_usd;
      }
    }

    return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
  }

  _fmtPrice(n) {
    if (n == null) return '—';
    if (n >= 1) return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  }
}

customElements.define('price-chart', PriceChart);
