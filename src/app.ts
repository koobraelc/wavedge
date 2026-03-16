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
import { DigestRepository } from "./db/digest-repository.js";
import { getDatabase } from "./db/database.js";
import { schedulerStatus } from "./scrapers/scheduler.js";
import { SchedulerRepository } from "./db/scheduler-repository.js";

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
  let dbCounts: Record<string, number> = {};
  let lastPriceFetch: string | null = null;
  let lastNewsFetch: string | null = null;
  let lastAlertCheck: string | null = null;
  let lastDigest: string | null = null;

  try {
    const db = getDatabase();
    const tokenCount = (db.prepare("SELECT COUNT(*) AS n FROM tokens").get() as { n: number }).n;
    const priceCount = (db.prepare("SELECT COUNT(*) AS n FROM prices").get() as { n: number }).n;
    const articleCount = (db.prepare("SELECT COUNT(*) AS n FROM articles").get() as { n: number }).n;
    const alertCount = (db.prepare("SELECT COUNT(*) AS n FROM triggered_alerts").get() as { n: number }).n;
    dbCounts = { tokens: tokenCount, prices: priceCount, articles: articleCount, alerts: alertCount };

    const latestPrice = db.prepare("SELECT MAX(fetched_at) AS ts FROM prices").get() as { ts: string | null };
    lastPriceFetch = latestPrice.ts;

    const latestNews = db.prepare("SELECT MAX(fetched_at) AS ts FROM articles").get() as { ts: string | null };
    lastNewsFetch = latestNews.ts;

    lastAlertCheck = schedulerStatus.alert.lastRun;

    const latestDigest = db.prepare("SELECT MAX(generated_at) AS ts FROM digest_history").get() as { ts: string | null };
    lastDigest = latestDigest.ts;
  } catch {
    dbStatus = "error";
  }

  // Determine overall status: degraded if DB error or data exceeds 2x expected interval
  let status: "ok" | "degraded" = dbStatus === "error" ? "degraded" : "ok";
  const now = Date.now();

  if (status === "ok") {
    const checks = [
      { ts: lastPriceFetch, intervalMs: 5 * 60 * 1000 },   // prices: 5min → degraded after 10min
      { ts: lastNewsFetch, intervalMs: 15 * 60 * 1000 },    // news: 15min → degraded after 30min
    ];
    for (const check of checks) {
      if (check.ts) {
        const age = now - new Date(check.ts + "Z").getTime();
        if (age > check.intervalMs * 2) {
          status = "degraded";
          break;
        }
      }
    }
  }

  res.json({
    status,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
    db: { status: dbStatus, counts: dbCounts },
    lastPriceFetch,
    lastNewsFetch,
    lastAlertCheck,
    lastDigest,
    schedulers: schedulerStatus,
  });
});

// Stale data check for dashboard banner (price data >10min old)
app.get("/api/health/freshness", (_req, res) => {
  try {
    const db = getDatabase();
    const latestPrice = db.prepare("SELECT MAX(fetched_at) AS ts FROM prices").get() as { ts: string | null };
    const ts = latestPrice.ts;
    let stale = false;
    let ageMinutes = 0;
    if (ts) {
      ageMinutes = Math.floor((Date.now() - new Date(ts + "Z").getTime()) / 60000);
      stale = ageMinutes > 10;
    } else {
      stale = true;
    }
    res.json({ stale, lastPriceFetch: ts, ageMinutes });
  } catch {
    res.json({ stale: true, lastPriceFetch: null, ageMinutes: null });
  }
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
    { loc: "/digest/latest", priority: "0.7", changefreq: "daily" },
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
Disallow: /onboarding
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
  var p = new URLSearchParams(window.location.search);
  var t = p.get('token');
  var isNew = p.get('new') === '1';
  if (t) { localStorage.setItem('wavedge_token', t); window.location.href = isNew ? '/onboarding' : '/dashboard'; }
  else { document.body.textContent = 'Invalid login link.'; }
</script>
</body></html>`);
});

// Onboarding wizard for new users
app.get("/onboarding", (_req, res) => {
  res.sendFile(path.join(publicDir, "onboarding.html"));
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

  <bottom-nav></bottom-nav>

  <!-- Web Components -->
  <script src="/js/components/nav-bar.js"></script>
  <script src="/js/components/alert-settings.js"></script>
  <script src="/js/components/alert-history.js"></script>
  <script src="/js/components/bottom-nav.js"></script>

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

// Public digest page
const digestRepo = new DigestRepository();
app.get("/digest/latest", (req, res) => {
  const lang = req.query.lang === "zh" ? "zh" : "en";
  const digest = digestRepo.getLatestDigest(lang);

  const title = digest
    ? `${digest.subject} — Wavedge Daily Digest`
    : "Daily Crypto Digest — Wavedge";
  const description = "Free daily crypto intelligence digest. AI-analyzed news, top movers, cross-signal alerts, and market outlook.";
  const digestDate = digest
    ? new Date(digest.generated_at).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "";

  const shareText = digest
    ? encodeURIComponent(`${digest.subject} — Wavedge Daily Digest ${baseUrl}/digest/latest`)
    : encodeURIComponent(`Wavedge Daily Crypto Digest ${baseUrl}/digest/latest`);

  const twitterUrl = `https://twitter.com/intent/tweet?text=${shareText}`;
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(`${baseUrl}/digest/latest`)}&text=${shareText}`;

  const digestContent = digest
    ? digest.content_html
    : `<div style="text-align:center;padding:3rem 1rem;color:#8b949e">
         <h2>No digest available yet</h2>
         <p>Subscribe below to get notified when the next digest is published.</p>
       </div>`;

  res.type("html").send(`<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${baseUrl}/digest/latest">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${baseUrl}/digest/latest">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <link rel="stylesheet" href="/css/styles.css">
  ${ga4Snippet()}
  <style>
    .digest-page { max-width: 720px; margin: 0 auto; padding: 2rem 1rem; }
    .digest-header { margin-bottom: 2rem; }
    .digest-date { color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.5rem; }
    .digest-title { font-size: 1.5rem; margin-bottom: 1rem; }
    .digest-share { display: flex; gap: 0.75rem; margin-bottom: 2rem; flex-wrap: wrap; }
    .share-btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; border-radius: var(--radius-sm); font-size: 0.85rem; text-decoration: none; font-weight: 500; border: 1px solid var(--border); transition: background 0.15s, border-color 0.15s; }
    .share-btn:hover { background: var(--bg-tertiary); border-color: var(--accent); }
    .share-btn-twitter { color: #1da1f2; }
    .share-btn-telegram { color: #0088cc; }
    .share-btn-copy { color: var(--text-secondary); cursor: pointer; background: none; }
    .digest-body { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius); padding: 2rem; margin-bottom: 2rem; line-height: 1.7; color: var(--text-primary); }
    .digest-body h1, .digest-body h2, .digest-body h3 { color: var(--text-primary); margin: 1.5rem 0 0.75rem; }
    .digest-body p { margin-bottom: 0.75rem; }
    .digest-body a { color: var(--link); }
    .digest-body ul, .digest-body ol { margin-bottom: 0.75rem; padding-left: 1.5rem; }
    .digest-subscribe { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.5rem; text-align: center; }
    .digest-subscribe h3 { margin-bottom: 0.5rem; }
    .digest-subscribe p { color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1rem; }
    .subscribe-form { display: flex; gap: 0.5rem; max-width: 400px; margin: 0 auto; }
    .subscribe-form input { flex: 1; padding: 0.5rem 0.75rem; background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-primary); font-size: 0.9rem; }
    .subscribe-form button { padding: 0.5rem 1.25rem; background: var(--accent); color: #fff; border: none; border-radius: var(--radius-sm); cursor: pointer; font-weight: 500; font-size: 0.9rem; }
    .subscribe-form button:hover { background: var(--accent-hover); }
    .subscribe-msg { margin-top: 0.5rem; font-size: 0.85rem; min-height: 1.2em; }
    .referral-note { color: var(--text-muted); font-size: 0.8rem; margin-top: 1.5rem; text-align: center; }
    .referral-note a { color: var(--link); }
    .digest-nav { display: flex; gap: 1rem; margin-bottom: 1rem; }
    .lang-btn { padding: 0.25rem 0.75rem; border-radius: var(--radius-sm); font-size: 0.85rem; text-decoration: none; border: 1px solid var(--border); color: var(--text-secondary); }
    .lang-btn.active { background: var(--accent); color: #fff; border-color: var(--accent); }
    .copy-toast { position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%); background: var(--green); color: #fff; padding: 0.5rem 1.25rem; border-radius: var(--radius-sm); font-size: 0.85rem; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
    .copy-toast.show { opacity: 1; }
  </style>
</head>
<body>
  <nav-bar></nav-bar>

  <main class="main-content digest-page">
    <div class="digest-header">
      <a href="/dashboard" class="back-link">&larr; Dashboard</a>
      <div class="digest-nav">
        <a href="/digest/latest?lang=en" class="lang-btn ${lang === "en" ? "active" : ""}">English</a>
        <a href="/digest/latest?lang=zh" class="lang-btn ${lang === "zh" ? "active" : ""}">中文</a>
      </div>
      ${digestDate ? `<div class="digest-date">${escapeHtml(digestDate)}</div>` : ""}
      <h1 class="digest-title">${digest ? escapeHtml(digest.subject) : "Daily Crypto Digest"}</h1>

      <div class="digest-share">
        <a href="${twitterUrl}" target="_blank" rel="noopener" class="share-btn share-btn-twitter">&#x1D54F; Share on Twitter</a>
        <a href="${telegramUrl}" target="_blank" rel="noopener" class="share-btn share-btn-telegram">&#x2708; Share on Telegram</a>
        <button class="share-btn share-btn-copy" onclick="navigator.clipboard.writeText('${baseUrl}/digest/latest').then(function(){var t=document.getElementById('copy-toast');t.classList.add('show');setTimeout(function(){t.classList.remove('show')},2000)})">&#x1F4CB; Copy Link</button>
      </div>
    </div>

    <div class="digest-body">${digestContent}</div>

    <div class="digest-subscribe">
      <h3>Get the daily digest in your inbox</h3>
      <p>Free. AI-analyzed crypto intelligence, every morning.</p>
      <form class="subscribe-form" onsubmit="event.preventDefault();var e=this.querySelector('input').value,m=this.querySelector('.subscribe-msg');fetch('/api/digest/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e})}).then(function(r){return r.json()}).then(function(d){m.textContent=d.error||'Subscribed! Check your inbox.';m.style.color=d.error?'var(--red)':'var(--green)'}).catch(function(){m.textContent='Something went wrong.';m.style.color='var(--red)'})">
        <input type="email" placeholder="you@example.com" required>
        <button type="submit">Subscribe</button>
      </form>
      <div class="subscribe-msg"></div>
    </div>

    <p class="referral-note">Forwarded to you? <a href="${baseUrl}/digest/latest">Subscribe free at wavedge.io/digest</a></p>
  </main>

  <div id="copy-toast" class="copy-toast">Link copied!</div>

  <script src="/js/components/nav-bar.js"></script>
</body>
</html>`);
});

// Shortcut: /digest redirects to /digest/latest
app.get("/digest", (_req, res) => {
  res.redirect("/digest/latest");
});

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

    <div class="token-faq-section" id="token-faq">
      <div class="section-header"><h2>Frequently Asked Questions</h2></div>
      <div class="loading-state"><span class="spinner"></span>Loading FAQ...</div>
    </div>

    <div class="token-related-section" id="token-related">
      <div class="section-header"><h2>Related Tokens</h2></div>
      <div class="loading-state"><span class="spinner"></span>Loading related tokens...</div>
    </div>

    <div class="token-news-section">
      <div class="section-header"><h2>Related News</h2></div>
      <div class="news-timeline" id="news-timeline"></div>
      <news-feed></news-feed>
    </div>
  </main>

  <bottom-nav></bottom-nav>

  <!-- Web Components -->
  <script src="/js/components/nav-bar.js"></script>
  <script src="/js/components/news-feed.js"></script>
  <script src="/js/components/bottom-nav.js"></script>

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
