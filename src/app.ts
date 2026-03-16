import express from "express";
import fs from "fs";
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
import { createAffiliateRouter } from "./api/affiliate.js";
import { createApiKeysRouter } from "./api/api-keys.js";
import { createHomepageRouter } from "./api/homepage.js";
import { createAdminRouter } from "./api/admin.js";
import { createWhalesRouter } from "./api/whales.js";
import { PriceRepository } from "./db/price-repository.js";
import { DigestRepository } from "./db/digest-repository.js";
import { getDatabase } from "./db/database.js";
import { schedulerStatus } from "./scrapers/scheduler.js";
import { SchedulerRepository } from "./db/scheduler-repository.js";
import { cacheMiddleware } from "./services/response-cache.js";

// i18n: locale support
declare global {
  namespace Express {
    interface Request {
      locale?: string;
    }
  }
}

const SUPPORTED_LOCALES = ["zh-tw", "ja", "ko"] as const;

/** Generate a branded error page HTML string */
function renderErrorPage(statusCode: number, title: string, message: string, suggestion?: string): string {
  const suggestions: Record<number, string> = {
    404: suggestion || "The page you're looking for doesn't exist or may have been moved.",
    500: suggestion || "Something went wrong on our end. Please try again in a moment.",
  };
  const desc = suggestions[statusCode] || suggestion || "An unexpected error occurred.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | Wavedge</title>
  <link rel="stylesheet" href="/css/styles.css">
  <style>
    .error-page { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 80vh; text-align: center; padding: 2rem; }
    .error-code { font-size: 6rem; font-weight: 800; color: var(--accent); line-height: 1; margin-bottom: 0.5rem; letter-spacing: -2px; }
    .error-title { font-size: 1.5rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.75rem; }
    .error-message { color: var(--text-secondary); max-width: 440px; margin-bottom: 2rem; line-height: 1.6; }
    .error-actions { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
    .error-actions a { display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; border-radius: var(--radius); font-size: 0.875rem; font-weight: 500; transition: all 0.15s; text-decoration: none; }
    .error-btn-primary { background: var(--accent); color: #fff; }
    .error-btn-primary:hover { background: var(--accent-hover); text-decoration: none; }
    .error-btn-secondary { background: var(--bg-tertiary); color: var(--text-secondary); border: 1px solid var(--border); }
    .error-btn-secondary:hover { color: var(--text-primary); border-color: var(--text-muted); text-decoration: none; }
  </style>
</head>
<body>
  <nav-bar></nav-bar>
  <main class="error-page">
    <div class="error-code">${statusCode}</div>
    <h1 class="error-title">${title}</h1>
    <p class="error-message">${desc}</p>
    <div class="error-actions">
      <a href="/dashboard" class="error-btn-primary">&#8592; Back to Dashboard</a>
      <a href="/market" class="error-btn-secondary">Explore Market</a>
    </div>
  </main>
  <script src="/js/i18n.js"></script>
  <script>window.i18n.init();</script>
  <script src="/js/theme-switcher.js"></script>
  <script src="/js/components/info-tip.js"></script>
  <script src="/js/components/nav-bar.js"></script>
</body>
</html>`;
}
const LOCALE_PATTERN = /^\/(zh-tw|ja|ko)(\/|$)/;

/** Map URL locale slug to BCP-47 lang tag */
function toLangTag(locale: string): string {
  if (locale === "zh-tw") return "zh-TW";
  return locale; // ja, ko, en are already valid
}

/** Generate <link rel="alternate" hreflang> tags for a given path */
function hreflangTags(pagePath: string): string {
  const base = process.env.BASE_URL || "https://wavedge.io";
  const canonical = pagePath === "/" ? "" : pagePath;
  const lines = [
    `<link rel="alternate" hreflang="en" href="${base}${canonical}">`,
    `<link rel="alternate" hreflang="x-default" href="${base}${canonical}">`,
    ...SUPPORTED_LOCALES.map(
      (l) => `<link rel="alternate" hreflang="${toLangTag(l)}" href="${base}/${l}${canonical}">`
    ),
  ];
  return lines.join("\n  ");
}

/** Read an HTML file, inject lang attribute and hreflang tags, then send */
function sendLocalizedFile(
  req: express.Request,
  res: express.Response,
  filePath: string,
  pagePath: string
): void {
  let html = fs.readFileSync(filePath, "utf-8");
  const lang = toLangTag(req.locale || "en");

  // Inject lang attribute on <html> tag
  html = html.replace(/<html(\s|>)/, `<html lang="${lang}"$1`);
  // If <html lang="en"> already exists, replace it
  html = html.replace(/<html lang="[^"]*"/, `<html lang="${lang}"`);

  // Inject hreflang tags before </head>
  const tags = hreflangTags(pagePath);
  html = html.replace("</head>", `  ${tags}\n</head>`);

  res.type("html").send(html);
}

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

// Stale data check for dashboard banner with tiered thresholds.
// Prices update every 5 min. "slightly behind" (<15 min) is normal and should not alarm users.
// "stale" (15-30 min) shows a subtle notice. "very stale" (>30 min) shows a warning banner.
app.get("/api/health/freshness", (_req, res) => {
  try {
    const db = getDatabase();
    const latestPrice = db.prepare("SELECT MAX(fetched_at) AS ts FROM prices").get() as { ts: string | null };
    const ts = latestPrice.ts;
    let ageMinutes = 0;
    let level: "fresh" | "slight" | "stale" | "critical" = "fresh";

    if (ts) {
      ageMinutes = Math.floor((Date.now() - new Date(ts + "Z").getTime()) / 60000);
      if (ageMinutes > 30) {
        level = "critical"; // Something is likely broken
      } else if (ageMinutes > 15) {
        level = "stale"; // Noticeable delay, show subtle notice
      } else if (ageMinutes > 10) {
        level = "slight"; // Slightly behind, hide banner
      }
      // <= 10 min: fresh, no banner
    } else {
      level = "critical";
    }

    res.json({
      stale: level === "stale" || level === "critical", // backward compat
      level,
      lastPriceFetch: ts,
      ageMinutes,
    });
  } catch {
    res.json({ stale: true, level: "critical", lastPriceFetch: null, ageMinutes: null });
  }
});

// Public config endpoint (GA4 ID, base URL — no secrets)
app.get("/api/config", (_req, res) => {
  res.json({
    gaId: process.env.GOOGLE_ANALYTICS_ID || "",
    baseUrl: process.env.BASE_URL || "https://wavedge.io",
  });
});

// Ad slot config — returns ad HTML/script snippets from env vars
app.get("/api/config/ads", (_req, res) => {
  res.json({
    bannerCode: process.env.AD_BANNER_CODE || "",
    sidebarCode: process.env.AD_SIDEBAR_CODE || "",
  });
});

app.use("/api", apiLimiter);
app.use("/api/prices", cacheMiddleware(30), createPricesRouter());
app.use("/api/news", cacheMiddleware(60), createNewsRouter());
app.use("/api/tokens", cacheMiddleware(30), createTokensRouter());
app.use("/api/search", cacheMiddleware(30), createSearchRouter());
app.use("/api/alerts", createAlertsRouter());
app.use("/api/digest", createDigestRouter());
app.use("/api/auth", createAuthRouter());
app.use("/api/billing", createBillingRouter());
app.use("/api/webhooks", createWebhookRouter());
app.use("/api/affiliate", createAffiliateRouter());
app.use("/api/api-keys", createApiKeysRouter());
app.use("/api/homepage", cacheMiddleware(30), createHomepageRouter());
app.use("/api/admin", createAdminRouter());
app.use("/api/whales", cacheMiddleware(60), createWhalesRouter());

// i18n: Locale URL rewrite middleware
// Strips /:locale prefix, sets req.locale, so all downstream routes work unchanged.
// API routes are mounted above and never have locale prefixes.
app.use((req, _res, next) => {
  const match = req.path.match(LOCALE_PATTERN);
  if (match) {
    req.locale = match[1];
    // Rewrite URL: /zh-tw/dashboard → /dashboard, /zh-tw → /
    req.url = req.url.replace(`/${match[1]}`, "") || "/";
  } else {
    req.locale = "en";
  }
  next();
});

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
    { loc: "/market", priority: "0.8", changefreq: "hourly" },
    { loc: "/compare", priority: "0.7", changefreq: "daily" },
    { loc: "/login", priority: "0.3", changefreq: "monthly" },
    { loc: "/billing", priority: "0.3", changefreq: "monthly" },
    { loc: "/digest/latest", priority: "0.7", changefreq: "daily" },
    { loc: "/settings/alerts", priority: "0.5", changefreq: "monthly" },
    { loc: "/settings/api-keys", priority: "0.5", changefreq: "monthly" },
  ];

  // Generate URLs for all locales (en default + supported locales)
  const allPaths = [
    ...staticPages.map((p) => ({ path: p.loc, priority: p.priority, changefreq: p.changefreq })),
    ...tokens.map((t) => ({ path: `/tokens/${t.symbol}`, priority: "0.8", changefreq: "hourly" as const })),
  ];

  const urls: string[] = [];
  for (const p of allPaths) {
    // Default (en) URL
    urls.push(`  <url><loc>${baseUrl}${p.path}</loc><lastmod>${today}</lastmod><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`);
    // Locale-prefixed URLs
    for (const locale of SUPPORTED_LOCALES) {
      urls.push(`  <url><loc>${baseUrl}/${locale}${p.path}</loc><lastmod>${today}</lastmod><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`);
    }
  }

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
Disallow: /admin
Disallow: /api/admin/
Disallow: /api/alerts/

Sitemap: ${baseUrl}/sitemap.xml`
  );
});

// Landing page (root)
app.get("/", (req, res) => {
  sendLocalizedFile(req, res, path.join(publicDir, "landing.html"), "/");
});

// Dashboard
app.get("/dashboard", (req, res) => {
  sendLocalizedFile(req, res, path.join(publicDir, "index.html"), "/dashboard");
});

// Auth pages
app.get("/login", (req, res) => {
  sendLocalizedFile(req, res, path.join(publicDir, "login.html"), "/login");
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
app.get("/onboarding", (req, res) => {
  sendLocalizedFile(req, res, path.join(publicDir, "onboarding.html"), "/onboarding");
});

// Billing page
app.get("/billing", (req, res) => {
  sendLocalizedFile(req, res, path.join(publicDir, "billing.html"), "/billing");
});

// Admin Dashboard (internal, requires auth)
app.get("/admin", (req, res) => {
  const lang = toLangTag(req.locale || "en");
  res.type("html").send(`<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Dashboard — Wavedge</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="stylesheet" href="/css/styles.css">
  <style>
    .admin-page { max-width: 1200px; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
    .admin-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
    .admin-header h1 { font-size: 1.5rem; }
    .admin-badge { font-size: 0.75rem; background: var(--accent); color: #fff; padding: 0.2rem 0.6rem; border-radius: 10px; font-weight: 600; }
    .admin-updated { font-size: 0.8rem; color: var(--text-muted); }

    .admin-hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
    .hero-card { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.25rem; }
    .hero-card .hero-value { font-size: 1.75rem; font-weight: 700; line-height: 1.2; }
    .hero-card .hero-label { font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem; }
    .hero-card .hero-sub { font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem; }
    .hero-card.hero-green .hero-value { color: var(--green); }
    .hero-card.hero-yellow .hero-value { color: var(--yellow); }
    .hero-card.hero-red .hero-value { color: var(--red); }

    .admin-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .admin-panel { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem; opacity: 0.6; transition: opacity 0.3s; }
    .admin-panel h3 { font-size: 0.95rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }
    .panel-icon { font-size: 1.1rem; }

    .sparkline-container { height: 44px; margin-bottom: 0.75rem; }

    .breakdown-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; font-size: 0.82rem; }
    .breakdown-label { min-width: 90px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .breakdown-bar-track { flex: 1; height: 6px; background: var(--bg-tertiary); border-radius: 3px; overflow: hidden; }
    .breakdown-bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
    .breakdown-value { min-width: 80px; text-align: right; font-variant-numeric: tabular-nums; }

    .health-table { width: 100%; font-size: 0.82rem; border-collapse: collapse; }
    .health-table td { padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--border); }
    .health-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 0.5rem; }
    .health-healthy { background: var(--green); }
    .health-warning { background: var(--yellow); }
    .health-error { background: var(--red); }

    .subs-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .sub-stat { text-align: center; padding: 0.75rem; background: var(--bg-tertiary); border-radius: var(--radius-sm); }
    .sub-stat .sub-value { font-size: 1.5rem; font-weight: 700; }
    .sub-stat .sub-label { font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.2rem; }

    .error-row { padding: 0.6rem 0; border-bottom: 1px solid var(--border); }
    .error-row:last-child { border-bottom: none; }
    .error-meta { font-size: 0.8rem; margin-bottom: 0.25rem; }
    .error-task { font-weight: 600; color: var(--yellow); }
    .error-msg { font-size: 0.8rem; color: var(--text-secondary); word-break: break-word; white-space: pre-wrap; max-height: 3em; overflow: hidden; }

    .admin-denied { text-align: center; padding: 4rem 1rem; }
    .admin-denied h2 { margin-bottom: 0.5rem; }
    .admin-denied p { color: var(--text-secondary); margin-bottom: 1.5rem; }

    .admin-loading { text-align: center; padding: 2rem; color: var(--text-muted); }

    .text-muted { color: var(--text-muted); }
    .btn-primary { display: inline-block; padding: 0.5rem 1.25rem; background: var(--accent); color: #fff; border: none; border-radius: var(--radius-sm); text-decoration: none; font-weight: 500; }

    @media (max-width: 600px) {
      .admin-hero { grid-template-columns: repeat(2, 1fr); }
      .admin-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <nav-bar></nav-bar>

  <main class="main-content admin-page">
    <div class="admin-header">
      <div>
        <a href="/dashboard" class="back-link">&larr; Dashboard</a>
        <h1>Admin Dashboard <span class="admin-badge">Internal</span></h1>
      </div>
    </div>

    <div class="admin-content">
      <div class="admin-loading">Loading admin data...</div>

      <div class="admin-hero">
        <div class="hero-card">
          <div class="hero-value" id="stat-total-users">—</div>
          <div class="hero-label">Total Users</div>
          <div class="hero-sub"><span id="stat-signups-today"></span> · <span id="stat-signups-week"></span></div>
        </div>
        <div class="hero-card hero-green">
          <div class="hero-value" id="stat-pro-users">—</div>
          <div class="hero-label">Pro Users</div>
          <div class="hero-sub"><span id="stat-free-users"></span> · <span id="stat-active-subs"></span></div>
        </div>
        <div class="hero-card hero-green">
          <div class="hero-value" id="stat-mrr">—</div>
          <div class="hero-label">MRR</div>
        </div>
        <div class="hero-card">
          <div class="hero-value" id="stat-articles-today">—</div>
          <div class="hero-label">Articles Today</div>
          <div class="hero-sub" id="stat-articles-week"></div>
        </div>
        <div class="hero-card hero-yellow">
          <div class="hero-value" id="stat-alerts-today">—</div>
          <div class="hero-label">Alerts Today</div>
          <div class="hero-sub"><span id="stat-alerts-week"></span> · <span id="stat-missed-today"></span></div>
        </div>
        <div class="hero-card hero-red">
          <div class="hero-value" id="stat-errors-today">—</div>
          <div class="hero-label">Errors Today</div>
          <div class="hero-sub" id="stat-errors-week"></div>
        </div>
      </div>

      <div class="admin-grid">
        <div class="admin-panel">
          <h3>User Signups (14 days)</h3>
          <div class="sparkline-container" id="spark-signups"></div>
        </div>
        <div class="admin-panel">
          <h3>News Ingestion (14 days)</h3>
          <div class="sparkline-container" id="spark-articles"></div>
        </div>
        <div class="admin-panel">
          <h3>Alerts Triggered (14 days)</h3>
          <div class="sparkline-container" id="spark-alerts"></div>
        </div>

        <div class="admin-panel">
          <h3>News Categories (7 days)</h3>
          <div id="category-breakdown"></div>
        </div>
        <div class="admin-panel">
          <h3>News Sources (7 days)</h3>
          <div id="source-breakdown"></div>
        </div>
        <div class="admin-panel">
          <h3>Alert Channels (7 days)</h3>
          <div id="channel-breakdown"></div>
        </div>

        <div class="admin-panel">
          <h3>System Health</h3>
          <table class="health-table">
            <tbody id="health-table"></tbody>
          </table>
        </div>

        <div class="admin-panel">
          <h3>Subscribers</h3>
          <div class="subs-grid">
            <div class="sub-stat">
              <div class="sub-value" id="stat-digest-subs">—</div>
              <div class="sub-label">Digest Email</div>
            </div>
            <div class="sub-stat">
              <div class="sub-value" id="stat-push-subs">—</div>
              <div class="sub-label">Web Push</div>
            </div>
          </div>
        </div>
      </div>

      <div class="admin-panel" style="opacity:0.6">
        <h3>Recent Errors</h3>
        <div id="errors-list" style="max-height:300px;overflow-y:auto"></div>
      </div>
    </div>
  </main>

  <bottom-nav></bottom-nav>

  <script src="/js/theme-switcher.js"></script>
  <script src="/js/components/nav-bar.js"></script>
  <script src="/js/components/bottom-nav.js"></script>
  <script src="/js/admin-app.js"></script>
</body>
</html>`);
});

// Market Overview page
app.get("/market", (req, res) => {
  const lang = toLangTag(req.locale || "en");
  const title = "Market Overview — Crypto Heatmap & Sector Performance | Wavedge";
  const description = "Live crypto market heatmap, sector performance breakdown, and top movers. See which tokens are surging and which sectors are leading.";

  res.type("html").send(`<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${baseUrl}/market">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${baseUrl}/market">
  ${hreflangTags("/market")}
  <link rel="stylesheet" href="/css/styles.css">
  ${ga4Snippet()}
</head>
<body>
  <a href="#main-content" class="skip-link">Skip to content</a>
  <nav-bar></nav-bar>

  <main class="main-content market-page" id="main-content">
    <breadcrumb-nav></breadcrumb-nav>
    <div class="market-header">
      <div>
        <h1>Market Overview</h1>
        <p class="page-subtitle">Real-time crypto market data with heatmap, sector performance, and top movers.</p>
      </div>
      <span class="market-updated" id="last-updated"></span>
    </div>

    <section class="market-section">
      <div class="section-header"><h2>Heatmap</h2></div>
      <div id="heatmap">
        <div class="loading-state"><span class="spinner"></span>Loading market data...</div>
      </div>
    </section>

    <section class="market-section">
      <div class="section-header"><h2>Sector Performance</h2></div>
      <div id="sectors">
        <div class="loading-state"><span class="spinner"></span>Loading sectors...</div>
      </div>
    </section>

    <div class="market-movers-grid">
      <section class="market-section">
        <div class="section-header"><h2>Top Gainers</h2></div>
        <div id="top-movers">
          <div class="loading-state"><span class="spinner"></span>Loading...</div>
        </div>
      </section>
      <section class="market-section">
        <div class="section-header"><h2>Top Losers</h2></div>
        <div id="top-losers">
          <div class="loading-state"><span class="spinner"></span>Loading...</div>
        </div>
      </section>
    </div>

    <ad-slot variant="banner"></ad-slot>
  </main>

  <bottom-nav></bottom-nav>

  <script src="/js/i18n.js"></script>
  <script>window.i18n.init();</script>
  <script src="/js/theme-switcher.js"></script>
  <script src="/js/components/nav-bar.js"></script>
  <script src="/js/components/bottom-nav.js"></script>
  <script src="/js/components/ad-slot.js"></script>
  <script src="/js/components/breadcrumb-nav.js"></script>
  <script src="/js/market-app.js"></script>
</body>
</html>`);
});

// Redirect /alerts to /settings/alerts
app.get("/alerts", (_req, res) => {
  res.redirect(301, "/settings/alerts");
});

// Alert settings page
app.get("/settings/alerts", (req, res) => {
  const lang = toLangTag(req.locale || "en");
  const title = "Alert Settings — Wavedge";
  const description = "Configure your crypto alert preferences. Choose tokens to watch, notification channels, and sensitivity levels.";

  res.type("html").send(`<!DOCTYPE html>
<html lang="${lang}">
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
  ${hreflangTags("/settings/alerts")}
  <link rel="stylesheet" href="/css/styles.css">
  ${ga4Snippet()}
</head>
<body>
  <a href="#main-content" class="skip-link">Skip to content</a>
  <nav-bar></nav-bar>
  <breadcrumb-nav></breadcrumb-nav>

  <main class="main-content settings-page" id="main-content">
    <h1 class="settings-title">Settings</h1>

    <div class="settings-nav" style="display:flex;gap:0.5rem;margin-bottom:1.5rem">
      <a href="/settings/alerts" style="padding:0.4rem 0.75rem;border-radius:6px;font-size:0.85rem;background:var(--accent);border:1px solid var(--accent);color:#fff;text-decoration:none">Alerts</a>
      <a href="/settings/api-keys" style="padding:0.4rem 0.75rem;border-radius:6px;font-size:0.85rem;color:var(--text-secondary);border:1px solid var(--border);text-decoration:none">API Keys</a>
    </div>

    <alert-settings></alert-settings>

    <div class="settings-section">
      <div class="section-header"><h2>Alert History</h2></div>
      <alert-history></alert-history>
    </div>
  </main>

  <bottom-nav></bottom-nav>

  <!-- Web Components -->
  <script src="/js/theme-switcher.js"></script>
  <script src="/js/components/info-tip.js"></script>
  <script src="/js/components/nav-bar.js"></script>
  <script src="/js/components/breadcrumb-nav.js"></script>
  <script src="/js/components/alert-settings.js"></script>
  <script src="/js/components/alert-history.js"></script>
  <script src="/js/components/bottom-nav.js"></script>
  <script src="/js/components/affiliate-cta.js"></script>

  <!-- Settings app -->
  <script src="/js/settings-app.js"></script>
</body>
</html>`);
});

// API Key Settings page
app.get("/settings/api-keys", (req, res) => {
  const lang = toLangTag(req.locale || "en");
  const title = "API Key Settings — Wavedge";
  const description = "Manage your Wavedge API keys. Generate, view, and revoke keys for programmatic access.";

  res.type("html").send(`<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  ${hreflangTags("/settings/api-keys")}
  <link rel="stylesheet" href="/css/styles.css">
  <style>
    .api-usage-bar { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.25rem; margin-bottom: 1.5rem; }
    .usage-label { display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.5rem; }
    .usage-count { color: var(--text-secondary); }
    .usage-track { height: 6px; background: var(--bg-tertiary); border-radius: 3px; overflow: hidden; }
    .usage-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.3s; }
    .usage-meta { font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem; }

    .api-key-create { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem; margin-bottom: 1.5rem; }
    .api-key-create h3 { margin-bottom: 0.75rem; font-size: 1rem; }
    .create-key-form { display: flex; gap: 0.5rem; }
    .create-key-form .input { flex: 1; padding: 0.5rem 0.75rem; background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-primary); font-size: 0.9rem; }
    .create-key-form .input:focus { outline: none; border-color: var(--accent); }

    .new-key-display { margin-top: 1rem; }
    .new-key-warning { color: var(--yellow); font-size: 0.85rem; font-weight: 500; margin-bottom: 0.5rem; }
    .new-key-value { display: flex; align-items: center; gap: 0.5rem; background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.75rem; }
    .new-key-value code { flex: 1; font-size: 0.85rem; word-break: break-all; color: var(--green); }

    .api-key-list { margin-bottom: 1.5rem; }
    .api-key-list h3 { margin-bottom: 0.75rem; font-size: 1rem; }

    .keys-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    .keys-table th { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); color: var(--text-secondary); font-weight: 500; }
    .keys-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); }
    .keys-table code { background: var(--bg-tertiary); padding: 0.15rem 0.4rem; border-radius: 3px; font-size: 0.8rem; }
    .keys-table-revoked { opacity: 0.6; }

    .revoked-keys { margin-bottom: 1.5rem; }
    .revoked-keys summary { cursor: pointer; color: var(--text-secondary); font-size: 0.9rem; padding: 0.5rem 0; }

    .api-docs-hint { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem; }
    .api-docs-hint h3 { margin-bottom: 0.75rem; font-size: 1rem; }
    .api-docs-hint pre { background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.75rem; overflow-x: auto; margin-bottom: 0.5rem; }
    .api-docs-hint code { font-size: 0.8rem; color: var(--text-primary); }

    .api-keys-upgrade { text-align: center; padding: 3rem 1rem; }
    .api-keys-upgrade h3 { margin-bottom: 0.5rem; }
    .api-keys-upgrade p { color: var(--text-secondary); margin-bottom: 1.5rem; max-width: 400px; margin-left: auto; margin-right: auto; }

    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: all 0.15s; background: var(--bg-tertiary); color: var(--text-primary); text-decoration: none; }
    .btn:hover { border-color: var(--text-muted); text-decoration: none; }
    .btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-danger { background: transparent; border-color: var(--red); color: var(--red); }
    .btn-danger:hover { background: var(--red); color: #fff; }
    .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.8rem; }
    .btn-copy { background: var(--accent); border-color: var(--accent); color: #fff; }
    .text-muted { color: var(--text-muted); font-size: 0.85rem; }
    .text-error { color: var(--red); }

    .settings-nav { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
    .settings-nav a { padding: 0.4rem 0.75rem; border-radius: var(--radius-sm); font-size: 0.85rem; color: var(--text-secondary); border: 1px solid var(--border); text-decoration: none; transition: all 0.15s; }
    .settings-nav a:hover { border-color: var(--text-muted); color: var(--text-primary); }
    .settings-nav a.active { background: var(--accent); border-color: var(--accent); color: #fff; }
  </style>
</head>
<body>
  <a href="#main-content" class="skip-link">Skip to content</a>
  <nav-bar></nav-bar>
  <breadcrumb-nav></breadcrumb-nav>

  <main class="main-content settings-page" id="main-content">
    <h1 class="settings-title">Settings</h1>

    <div class="settings-nav">
      <a href="/settings/alerts">Alerts</a>
      <a href="/settings/api-keys" class="active">API Keys</a>
    </div>

    <api-key-manager></api-key-manager>
  </main>

  <bottom-nav></bottom-nav>

  <script src="/js/theme-switcher.js"></script>
  <script src="/js/components/nav-bar.js"></script>
  <script src="/js/components/breadcrumb-nav.js"></script>
  <script src="/js/components/api-key-manager.js"></script>
  <script src="/js/components/bottom-nav.js"></script>
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
  const digestLang = req.query.lang === "zh" ? "zh" : "en";
  const htmlLang = toLangTag(req.locale || "en");
  const digest = digestRepo.getLatestDigest(digestLang);

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
<html lang="${htmlLang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${baseUrl}/digest/latest">
  ${hreflangTags("/digest/latest")}
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
        <a href="/digest/latest?lang=en" class="lang-btn ${digestLang === "en" ? "active" : ""}">English</a>
        <a href="/digest/latest?lang=zh" class="lang-btn ${digestLang === "zh" ? "active" : ""}">中文</a>
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

    <ad-slot variant="banner"></ad-slot>

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

  <script src="/js/theme-switcher.js"></script>
  <script src="/js/components/nav-bar.js"></script>
  <script src="/js/components/ad-slot.js"></script>
</body>
</html>`);
});

// Shortcut: /digest redirects to /digest/latest
app.get("/digest", (_req, res) => {
  res.redirect("/digest/latest");
});

// Token Comparison page
app.get("/compare", (req, res) => {
  const lang = toLangTag(req.locale || "en");
  const title = "Compare Tokens — Side-by-Side Price & News Impact | Wavedge";
  const description = "Compare 2-3 crypto tokens side by side. Price charts, news impact scores, and alert history in one view. Shareable comparison links.";

  res.type("html").send(`<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${baseUrl}/compare">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${baseUrl}/compare">
  ${hreflangTags("/compare")}
  <link rel="stylesheet" href="/css/styles.css">
  ${ga4Snippet()}
</head>
<body>
  <a href="#main-content" class="skip-link">Skip to content</a>
  <nav-bar></nav-bar>

  <main class="main-content compare-page" id="main-content">
    <breadcrumb-nav></breadcrumb-nav>
    <div class="compare-header">
      <h1>Compare Tokens</h1>
      <p class="compare-subtitle">Select 2–3 tokens to compare price trends and news impact side by side.</p>
    </div>

    <div class="compare-token-picker" id="token-picker">
      <div class="compare-picker-slots">
        <div class="picker-slot" data-slot="0">
          <input type="text" class="picker-input" placeholder="Search token (e.g. BTC)" autocomplete="off">
          <div class="picker-dropdown"></div>
          <div class="picker-selected"></div>
        </div>
        <span class="picker-vs">vs</span>
        <div class="picker-slot" data-slot="1">
          <input type="text" class="picker-input" placeholder="Search token (e.g. ETH)" autocomplete="off">
          <div class="picker-dropdown"></div>
          <div class="picker-selected"></div>
        </div>
        <span class="picker-vs">vs</span>
        <div class="picker-slot" data-slot="2">
          <input type="text" class="picker-input" placeholder="Search token (e.g. SOL)" autocomplete="off">
          <div class="picker-dropdown"></div>
          <div class="picker-selected"></div>
        </div>
      </div>
      <div class="compare-actions">
        <button class="btn-compare" id="btn-compare" disabled>Compare</button>
        <button class="btn-share" id="btn-share" title="Copy shareable link">Share Link</button>
      </div>
    </div>

    <div class="compare-time-range" id="compare-time-range" style="display:none">
      <button class="range-btn" data-range="1d">1D</button>
      <button class="range-btn" data-range="1w">1W</button>
      <button class="range-btn active" data-range="1m">1M</button>
      <button class="range-btn" data-range="3m">3M</button>
    </div>

    <div class="compare-charts" id="compare-charts"></div>

    <div class="compare-metrics" id="compare-metrics"></div>

    <div class="compare-impact" id="compare-impact"></div>

    <div class="compare-news" id="compare-news"></div>

    <ad-slot variant="banner"></ad-slot>
  </main>

  <bottom-nav></bottom-nav>

  <div id="copy-toast" class="copy-toast">Link copied!</div>

  <script src="/js/i18n.js"></script>
  <script>window.i18n.init();</script>
  <script src="/js/theme-switcher.js"></script>
  <script src="/js/components/nav-bar.js"></script>
  <script src="/js/components/bottom-nav.js"></script>
  <script src="/js/components/ad-slot.js"></script>
  <script src="/js/components/breadcrumb-nav.js"></script>

  <script>
    var s = document.createElement('script');
    s.src = 'https://unpkg.com/lightweight-charts@4.2.2/dist/lightweight-charts.standalone.production.js';
    s.onload = function() {
      var e = document.createElement('script'); e.src = '/js/compare-app.js'; document.body.appendChild(e);
    };
    document.body.appendChild(s);
  </script>
</body>
</html>`);
});

app.get("/tokens/:symbol", (req, res) => {
  const symbol = req.params.symbol.toLowerCase();
  const token = priceRepo.getTokenBySymbol(symbol);

  if (!token) {
    const sym = req.params.symbol.toUpperCase();
    res.status(404).type("html").send(renderErrorPage(
      404,
      "Token Not Found",
      `We couldn't find a token with symbol "${sym}". It may not be tracked yet, or the symbol might be incorrect.`,
    ));
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

  const tokenLang = toLangTag(req.locale || "en");
  const tokenPath = `/tokens/${escapeHtml(displaySymbol)}`;

  res.type("html").send(`<!DOCTYPE html>
<html lang="${tokenLang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${baseUrl}${tokenPath}">
  ${hreflangTags(tokenPath)}
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${baseUrl}${tokenPath}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <link rel="stylesheet" href="/css/styles.css">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  ${ga4Snippet()}
</head>
<body>
  <a href="#main-content" class="skip-link">Skip to content</a>
  <nav-bar></nav-bar>
  <breadcrumb-nav></breadcrumb-nav>

  <main class="main-content token-page" id="main-content" data-symbol="${escapeHtml(symbol)}" data-name="${escapeHtml(displayName)}">
    <div class="token-hero">
      <div class="token-hero-info">
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

    <affiliate-cta symbol="${escapeHtml(displaySymbol)}" variant="token"></affiliate-cta>

    <ad-slot variant="sidebar"></ad-slot>

    <div class="token-summary-section" id="token-summary">
      <div class="section-header"><h2>AI Weekly Summary</h2></div>
      <div class="loading-state"><span class="spinner"></span>Generating summary...</div>
    </div>

    <div class="token-impact-section" id="token-impact">
      <div class="section-header"><h2>Impact Statistics</h2></div>
      <div class="loading-state"><span class="spinner"></span>Loading impact data...</div>
    </div>

    <div class="token-sentiment-section" id="token-sentiment">
      <div class="section-header"><h2>Social Sentiment</h2></div>
      <div class="loading-state"><span class="spinner"></span>Loading sentiment data...</div>
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
  <script src="/js/theme-switcher.js"></script>
  <script src="/js/components/info-tip.js"></script>
  <script src="/js/components/nav-bar.js"></script>
  <script src="/js/components/breadcrumb-nav.js"></script>
  <script src="/js/components/news-feed.js"></script>
  <script src="/js/components/bottom-nav.js"></script>
  <script src="/js/components/affiliate-cta.js"></script>
  <script src="/js/components/ad-slot.js"></script>

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

// --- Catch-all 404 for unmatched routes ---
app.use((_req, res) => {
  res.status(404).type("html").send(renderErrorPage(
    404,
    "Page Not Found",
    "The page you're looking for doesn't exist or may have been moved.",
  ));
});

// --- Global error handler (500) ---
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[500]", err);
  res.status(500).type("html").send(renderErrorPage(
    500,
    "Something Went Wrong",
    "We hit an unexpected error. Our team has been notified. Please try again shortly.",
  ));
});

export { app };
