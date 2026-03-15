import express from "express";
import rateLimit from "express-rate-limit";
import { createPricesRouter } from "./api/prices.js";
import { createNewsRouter } from "./api/news.js";
import { createTokensRouter } from "./api/tokens.js";
import { createSearchRouter } from "./api/search.js";

const app = express();

app.use(express.json());

// Rate limiting: 100 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
  });
});

app.use("/api", apiLimiter);
app.use("/api/prices", createPricesRouter());
app.use("/api/news", createNewsRouter());
app.use("/api/tokens", createTokensRouter());
app.use("/api/search", createSearchRouter());

/** Simple HTML dashboard */
app.get("/", (_req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wavedge — Crypto Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #e6edf3; padding: 20px; }
    h1 { font-size: 1.6rem; margin-bottom: 4px; }
    .subtitle { color: #8b949e; margin-bottom: 20px; }
    .stats { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .stat-card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px 20px; min-width: 140px; }
    .stat-card .label { color: #8b949e; font-size: 0.85rem; }
    .stat-card .value { font-size: 1.4rem; font-weight: 600; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; background: #161b22; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
    th { background: #21262d; text-align: left; padding: 10px 14px; font-size: 0.8rem; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 10px 14px; border-top: 1px solid #21262d; font-size: 0.9rem; }
    .green { color: #3fb950; } .red { color: #f85149; }
    h2 { font-size: 1.2rem; margin-bottom: 12px; margin-top: 8px; }
    a { color: #58a6ff; text-decoration: none; } a:hover { text-decoration: underline; }
    .loading { color: #8b949e; padding: 20px; text-align: center; }
    .news-item { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 14px 18px; margin-bottom: 10px; }
    .news-item .title { font-weight: 600; margin-bottom: 4px; }
    .news-item .meta { color: #8b949e; font-size: 0.8rem; }
    .tabs { display: flex; gap: 8px; margin-bottom: 16px; }
    .tab { padding: 6px 14px; border-radius: 6px; border: 1px solid #30363d; background: #161b22; color: #e6edf3; cursor: pointer; font-size: 0.85rem; }
    .tab.active { background: #1f6feb; border-color: #1f6feb; }
  </style>
</head>
<body>
  <h1>Wavedge</h1>
  <p class="subtitle">Crypto intelligence dashboard</p>

  <div class="stats" id="stats"><div class="loading">Loading stats...</div></div>

  <div class="tabs">
    <button class="tab active" onclick="showTab('prices')">Prices</button>
    <button class="tab" onclick="showTab('news')">News</button>
  </div>

  <div id="prices-section">
    <h2>Top Tokens by Market Cap</h2>
    <table><thead><tr>
      <th>#</th><th>Token</th><th>Price (USD)</th><th>24h Change</th><th>Market Cap</th><th>Volume</th>
    </tr></thead><tbody id="prices-body"><tr><td colspan="6" class="loading">Loading...</td></tr></tbody></table>
  </div>

  <div id="news-section" style="display:none">
    <h2>Latest News</h2>
    <div id="news-list"><div class="loading">Loading...</div></div>
  </div>

  <script>
    const fmt = (n, d=2) => n == null ? '—' : Number(n).toLocaleString(undefined, {minimumFractionDigits: d, maximumFractionDigits: d});
    const fmtBig = n => n == null ? '—' : n >= 1e9 ? (n/1e9).toFixed(2)+'B' : n >= 1e6 ? (n/1e6).toFixed(2)+'M' : fmt(n,0);

    async function load() {
      const [priceRes, newsRes] = await Promise.all([
        fetch('/api/prices').then(r => r.json()),
        fetch('/api/news?limit=30').then(r => r.json()),
      ]);

      document.getElementById('stats').innerHTML =
        '<div class="stat-card"><div class="label">Tokens Tracked</div><div class="value">'+priceRes.count+'</div></div>' +
        '<div class="stat-card"><div class="label">Latest News</div><div class="value">'+newsRes.count+'</div></div>';

      const rows = priceRes.data.map((p, i) =>
        '<tr><td>'+(i+1)+'</td><td><strong>'+p.symbol.toUpperCase()+'</strong> '+p.name+'</td>' +
        '<td>$'+fmt(p.price_usd)+'</td>' +
        '<td class="'+(p.price_change_percentage_24h >= 0 ? 'green' : 'red')+'">'+fmt(p.price_change_percentage_24h)+'%</td>' +
        '<td>$'+fmtBig(p.market_cap)+'</td><td>$'+fmtBig(p.total_volume)+'</td></tr>'
      ).join('');
      document.getElementById('prices-body').innerHTML = rows || '<tr><td colspan="6" class="loading">No data yet — prices update every 5 minutes</td></tr>';

      const articles = newsRes.data.map(a =>
        '<div class="news-item"><div class="title"><a href="'+a.url+'" target="_blank">'+a.title+'</a></div>' +
        (a.summary ? '<div style="margin:6px 0;font-size:0.88rem;color:#c9d1d9">'+a.summary.slice(0,200)+'</div>' : '') +
        '<div class="meta">'+a.source+' · '+new Date(a.published_at).toLocaleString()+(a.token_tags && a.token_tags !== '[]' ? ' · '+JSON.parse(a.token_tags).join(', ') : '')+'</div></div>'
      ).join('');
      document.getElementById('news-list').innerHTML = articles || '<div class="loading">No articles yet</div>';
    }

    function showTab(tab) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById('prices-section').style.display = tab === 'prices' ? '' : 'none';
      document.getElementById('news-section').style.display = tab === 'news' ? '' : 'none';
    }

    load();
    setInterval(load, 60000);
  </script>
</body>
</html>`);
});

export { app };
