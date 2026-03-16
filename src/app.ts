import express from "express";
import path from "path";
import rateLimit from "express-rate-limit";
import { createPricesRouter } from "./api/prices.js";
import { createNewsRouter } from "./api/news.js";
import { createTokensRouter } from "./api/tokens.js";
import { createSearchRouter } from "./api/search.js";
import { createAlertsRouter } from "./api/alerts.js";
import { createDigestRouter } from "./api/digest.js";
import { createAuthRouter } from "./api/auth.js";
import { createBillingRouter, createWebhookRouter } from "./api/billing.js";
import { PriceRepository } from "./db/price-repository.js";
import { getDatabase } from "./db/database.js";

const app = express();
const startedAt = Date.now();

// Stripe webhooks need raw body — mount before express.json()
app.use("/api/webhooks", express.raw({ type: "application/json" }));

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
  let dbStatus = "ok";
  try {
    const db = getDatabase();
    const row = db.prepare("SELECT COUNT(*) AS n FROM tokens").get() as { n: number };
    dbStatus = `ok (${row.n} tokens)`;
  } catch {
    dbStatus = "error";
  }

  res.json({
    status: "ok",
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
    database: dbStatus,
  });
});

// Public config endpoint (GA4 ID, base URL — no secrets)
app.get("/api/config", (_req, res) => {
  res.json({
    gaId: process.env.GOOGLE_ANALYTICS_ID || "",
    baseUrl: process.env.BASE_URL || "https://wavedge.io",
  });
});

app.use("/api", apiLimiter);
app.use("/api/prices", createPricesRouter());
app.use("/api/news", createNewsRouter());
app.use("/api/tokens", createTokensRouter());
app.use("/api/search", createSearchRouter());
app.use("/api/alerts", createAlertsRouter());
app.use("/api/digest", createDigestRouter());
app.use("/api/auth", createAuthRouter());
app.use("/api/billing", createBillingRouter());
app.use("/api/webhooks", createWebhookRouter());

// Serve static files from public directory
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

// SEO: Dynamic sitemap.xml
const sitemapRepo = new PriceRepository();
app.get("/sitemap.xml", (_req, res) => {
  const baseUrl = process.env.BASE_URL || "https://wavedge.io";
  const tokens = sitemapRepo.getAllTokens();
  const today = new Date().toISOString().split("T")[0];

  const staticPages = [
    { loc: "/", priority: "1.0", changefreq: "daily" },
    { loc: "/dashboard", priority: "0.8", changefreq: "hourly" },
    { loc: "/login", priority: "0.3", changefreq: "monthly" },
    { loc: "/billing", priority: "0.3", changefreq: "monthly" },
    { loc: "/settings/alerts", priority: "0.5", changefreq: "monthly" },
  ];

  const urls = staticPages
    .map(
      (p) =>
        `  <url><loc>${baseUrl}${p.loc}</loc><lastmod>${today}</lastmod><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`
    )
    .concat(
      tokens.map(
        (t) =>
          `  <url><loc>${baseUrl}/tokens/${t.symbol}</loc><lastmod>${today}</lastmod><changefreq>hourly</changefreq><priority>0.8</priority></url>`
      )
    );

  res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`
  );
});

// SEO: robots.txt
app.get("/robots.txt", (_req, res) => {
  const baseUrl = process.env.BASE_URL || "https://wavedge.io";
  res.type("text/plain").send(
    `User-agent: *
Allow: /

Disallow: /auth/callback
Disallow: /api/auth/
Disallow: /api/webhooks/
Disallow: /api/billing/
Disallow: /api/alerts/

Sitemap: ${baseUrl}/sitemap.xml`
  );
});

// Landing page (root)
app.get("/", (_req, res) => {
  res.sendFile(path.join(publicDir, "landing.html"));
});

// Dashboard
app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// Auth pages
app.get("/login", (_req, res) => {
  res.sendFile(path.join(publicDir, "login.html"));
});

// Handle magic link callback — store token client-side and redirect
app.get("/auth/callback", (_req, res) => {
  res.type("html").send(`<!DOCTYPE html>
<html><head><title>Signing in...</title></head>
<body>
<script>
  var t = new URLSearchParams(window.location.search).get('token');
  if (t) { localStorage.setItem('wavedge_token', t); window.location.href = '/dashboard'; }
  else { document.body.textContent = 'Invalid login link.'; }
</script>
</body></html>`);
});

// Billing page
app.get("/billing", (_req, res) => {
  res.sendFile(path.join(publicDir, "billing.html"));
});

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
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${baseUrl}/settings/alerts">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <link rel="canonical" href="${baseUrl}/settings/alerts">
  <link rel="stylesheet" href="/css/styles.css">
  ${ga4Snippet()}
</head>
<body>
  <nav-bar></nav-bar>

  <main class="main-content settings-page">
    <a href="/dashboard" class="back-link">&larr; Dashboard</a>
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

// SEO helpers
const priceRepo = new PriceRepository();
const baseUrl = process.env.BASE_URL || "https://wavedge.io";
const gaId = process.env.GOOGLE_ANALYTICS_ID || "";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ga4Snippet(): string {
  if (!gaId) return "";
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${escapeHtml(gaId)}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${escapeHtml(gaId)}');</script>`;
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

  // Structured data for token page
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": title,
    "description": description,
    "url": `${baseUrl}/tokens/${displaySymbol}`,
    "isPartOf": { "@type": "WebSite", "name": "Wavedge", "url": baseUrl },
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": baseUrl },
        { "@type": "ListItem", "position": 2, "name": "Tokens", "item": `${baseUrl}/dashboard` },
        { "@type": "ListItem", "position": 3, "name": `${displayName} (${displaySymbol})`, "item": `${baseUrl}/tokens/${displaySymbol}` },
      ],
    },
  };
  if (latestPrice) {
    Object.assign(jsonLd, {
      "mainEntity": {
        "@type": "FinancialProduct",
        "name": displayName,
        "alternateName": displaySymbol,
        "category": "Cryptocurrency",
        ...(latestPrice.price_usd ? {
          "offers": {
            "@type": "Offer",
            "price": String(latestPrice.price_usd),
            "priceCurrency": "USD",
          }
        } : {}),
      },
    });
  }

  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${baseUrl}/tokens/${escapeHtml(displaySymbol)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${baseUrl}/tokens/${escapeHtml(displaySymbol)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <link rel="stylesheet" href="/css/styles.css">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  ${ga4Snippet()}
</head>
<body>
  <nav-bar></nav-bar>

  <main class="main-content token-page" data-symbol="${escapeHtml(symbol)}" data-name="${escapeHtml(displayName)}">
    <div class="token-hero">
      <div class="token-hero-info">
        <a href="/dashboard" class="back-link">&larr; Dashboard</a>
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
        <div class="chart-skeleton">
          <div class="chart-skeleton-bars">
            <div class="chart-skel-bar" style="height:40%"></div>
            <div class="chart-skel-bar" style="height:65%"></div>
            <div class="chart-skel-bar" style="height:50%"></div>
            <div class="chart-skel-bar" style="height:80%"></div>
            <div class="chart-skel-bar" style="height:55%"></div>
            <div class="chart-skel-bar" style="height:70%"></div>
            <div class="chart-skel-bar" style="height:45%"></div>
            <div class="chart-skel-bar" style="height:60%"></div>
          </div>
        </div>
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
      <div class="news-timeline" id="news-timeline"></div>
      <news-feed></news-feed>
    </div>
  </main>

  <!-- Web Components -->
  <script src="/js/components/nav-bar.js"></script>
  <script src="/js/components/news-feed.js"></script>

  <!-- Lazy-load TradingView charts library -->
  <script>
    var s = document.createElement('script');
    s.src = 'https://unpkg.com/lightweight-charts@4.2.2/dist/lightweight-charts.standalone.production.js';
    s.onload = function() {
      var e = document.createElement('script'); e.src = '/js/token-app.js'; document.body.appendChild(e);
    };
    document.body.appendChild(s);
  </script>
</body>
</html>`);
});

export { app };
