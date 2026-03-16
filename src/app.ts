import express from "express";
import path from "path";
import rateLimit from "express-rate-limit";
import { createPricesRouter } from "./api/prices.js";
import { createNewsRouter } from "./api/news.js";
import { createTokensRouter } from "./api/tokens.js";
import { createSearchRouter } from "./api/search.js";
import { createAlertsRouter } from "./api/alerts.js";
import { createDigestRouter } from "./api/digest.js";
import { PriceRepository } from "./db/price-repository.js";

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
app.use("/api/alerts", createAlertsRouter());
app.use("/api/digest", createDigestRouter());

// Serve static files from public directory
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

// Alert settings page
app.get("/settings/alerts", (_req, res) => {
  const title = "Alert Settings — Wavedge";
  const description = "Configure your crypto alert preferences. Choose tokens to watch, notification channels, and sensitivity levels.";

  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body>
  <nav-bar></nav-bar>

  <main class="main-content settings-page">
    <a href="/" class="back-link">&larr; Dashboard</a>
    <h1 class="settings-title">Alert Settings</h1>

    <alert-settings></alert-settings>

    <div class="settings-section">
      <div class="section-header"><h2>Alert History</h2></div>
      <alert-history></alert-history>
    </div>
  </main>

  <!-- Web Components -->
  <script src="/js/components/nav-bar.js"></script>
  <script src="/js/components/alert-settings.js"></script>
  <script src="/js/components/alert-history.js"></script>

  <!-- Settings app -->
  <script src="/js/settings-app.js"></script>
</body>
</html>`);
});

// Token intelligence pages — dynamic SEO meta tags, client-side rendering
const priceRepo = new PriceRepository();

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

app.get("/tokens/:symbol", (req, res) => {
  const symbol = req.params.symbol.toLowerCase();
  const token = priceRepo.getTokenBySymbol(symbol);

  if (!token) {
    res.status(404).send("Token not found");
    return;
  }

  const displaySymbol = token.symbol.toUpperCase();
  const displayName = token.name;
  const history = priceRepo.getPriceHistory(token.id, 1);
  const latestPrice = history[0] || null;

  const priceStr = latestPrice
    ? `$${Number(latestPrice.price_usd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "";
  const title = `${displayName} (${displaySymbol}) — Price, News & AI Analysis | Wavedge`;
  const description = `${displaySymbol} intelligence hub${priceStr ? ` — current price ${priceStr}` : ""}. Candlestick charts, impact-scored news, AI weekly summary, and historical event timeline.`;

  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="/tokens/${escapeHtml(displaySymbol)}">
  <link rel="stylesheet" href="/css/styles.css">
  <script src="https://unpkg.com/lightweight-charts@4.2.2/dist/lightweight-charts.standalone.production.js"></script>
</head>
<body>
  <nav-bar></nav-bar>

  <main class="main-content token-page" data-symbol="${escapeHtml(symbol)}" data-name="${escapeHtml(displayName)}">
    <div class="token-hero">
      <div class="token-hero-info">
        <a href="/" class="back-link">&larr; Dashboard</a>
        <h1 class="token-hero-title">${escapeHtml(displayName)} <span class="token-hero-symbol">${escapeHtml(displaySymbol)}</span></h1>
        <div class="token-hero-price" id="hero-price"></div>
      </div>
    </div>

    <div class="token-chart-section">
      <div class="chart-header">
        <h2>Price Chart</h2>
        <div class="time-range-selector">
          <button class="range-btn" data-range="1d">1D</button>
          <button class="range-btn" data-range="1w">1W</button>
          <button class="range-btn active" data-range="1m">1M</button>
          <button class="range-btn" data-range="3m">3M</button>
        </div>
      </div>
      <div class="chart-container" id="token-chart">
        <div class="placeholder"><span class="spinner"></span>Loading chart...</div>
      </div>
    </div>

    <div class="token-summary-section" id="token-summary">
      <div class="section-header"><h2>AI Weekly Summary</h2></div>
      <div class="loading-state"><span class="spinner"></span>Generating summary...</div>
    </div>

    <div class="token-impact-section" id="token-impact">
      <div class="section-header"><h2>Impact Statistics</h2></div>
      <div class="loading-state"><span class="spinner"></span>Loading impact data...</div>
    </div>

    <div class="token-news-section">
      <div class="section-header"><h2>Related News</h2></div>
      <news-feed></news-feed>
    </div>
  </main>

  <!-- Web Components -->
  <script src="/js/components/nav-bar.js"></script>
  <script src="/js/components/news-feed.js"></script>

  <!-- Token page app -->
  <script src="/js/token-app.js"></script>
</body>
</html>`);
});

export { app };
