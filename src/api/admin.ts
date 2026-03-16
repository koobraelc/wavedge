import { Router } from "express";
import { getDatabase } from "../db/database.js";
import { requireAuth, type AuthenticatedRequest } from "../services/auth.js";
import { schedulerStatus } from "../scrapers/scheduler.js";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

function requireAdmin(req: AuthenticatedRequest, res: import("express").Response, next: import("express").NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  // If ADMIN_EMAILS is configured, enforce it; otherwise allow any authenticated user (dev mode)
  if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(req.user.email.toLowerCase())) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

export function createAdminRouter(): Router {
  const router = Router();

  router.get("/stats", requireAuth, requireAdmin, (_req, res) => {
    const db = getDatabase();

    // --- Users ---
    const totalUsers = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
    const proUsers = (db.prepare("SELECT COUNT(*) AS n FROM users WHERE tier = 'pro'").get() as { n: number }).n;
    const freeUsers = totalUsers - proUsers;

    const today = new Date().toISOString().split("T")[0];
    const signupsToday = (db.prepare("SELECT COUNT(*) AS n FROM users WHERE date(created_at) = ?").get(today) as { n: number }).n;

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const signupsWeek = (db.prepare("SELECT COUNT(*) AS n FROM users WHERE date(created_at) >= ?").get(weekAgo) as { n: number }).n;

    // Daily signups for the last 14 days
    const dailySignups = db.prepare(`
      SELECT date(created_at) AS day, COUNT(*) AS count
      FROM users
      WHERE created_at >= datetime('now', '-14 days')
      GROUP BY date(created_at)
      ORDER BY day
    `).all() as { day: string; count: number }[];

    // --- Subscriptions & MRR ---
    const activeSubscriptions = (db.prepare(
      "SELECT COUNT(*) AS n FROM subscriptions WHERE status IN ('active', 'trialing')"
    ).get() as { n: number }).n;

    // MRR estimate: count active pro subscriptions * price (assume $19/mo if not available)
    const proPriceMonthly = Number(process.env.PRO_PRICE_MONTHLY || "19");
    const mrr = activeSubscriptions * proPriceMonthly;

    // --- Alerts ---
    const totalAlerts = (db.prepare("SELECT COUNT(*) AS n FROM triggered_alerts").get() as { n: number }).n;
    const alertsToday = (db.prepare(
      "SELECT COUNT(*) AS n FROM triggered_alerts WHERE date(created_at) = ?"
    ).get(today) as { n: number }).n;
    const alertsWeek = (db.prepare(
      "SELECT COUNT(*) AS n FROM triggered_alerts WHERE date(created_at) >= ?"
    ).get(weekAgo) as { n: number }).n;

    const missedAlertsToday = (db.prepare(
      "SELECT COUNT(*) AS n FROM missed_alerts WHERE date(created_at) = ?"
    ).get(today) as { n: number }).n;

    // Alert delivery channel breakdown (last 7 days)
    const recentAlerts = db.prepare(
      "SELECT delivered_channels FROM triggered_alerts WHERE date(created_at) >= ?"
    ).all(weekAgo) as { delivered_channels: string }[];

    const channelCounts: Record<string, number> = {};
    for (const a of recentAlerts) {
      try {
        const channels = JSON.parse(a.delivered_channels) as string[];
        for (const ch of channels) {
          channelCounts[ch] = (channelCounts[ch] || 0) + 1;
        }
      } catch { /* skip */ }
    }

    // Daily alerts for chart
    const dailyAlerts = db.prepare(`
      SELECT date(created_at) AS day, COUNT(*) AS count
      FROM triggered_alerts
      WHERE created_at >= datetime('now', '-14 days')
      GROUP BY date(created_at)
      ORDER BY day
    `).all() as { day: string; count: number }[];

    // --- News ---
    const totalArticles = (db.prepare("SELECT COUNT(*) AS n FROM articles").get() as { n: number }).n;
    const articlesToday = (db.prepare(
      "SELECT COUNT(*) AS n FROM articles WHERE date(fetched_at) = ?"
    ).get(today) as { n: number }).n;
    const articlesWeek = (db.prepare(
      "SELECT COUNT(*) AS n FROM articles WHERE date(fetched_at) >= ?"
    ).get(weekAgo) as { n: number }).n;

    const totalClassified = (db.prepare("SELECT COUNT(*) AS n FROM news_categories").get() as { n: number }).n;
    const totalImpactEvents = (db.prepare("SELECT COUNT(*) AS n FROM impact_events").get() as { n: number }).n;

    // Category breakdown
    const categoryBreakdown = db.prepare(`
      SELECT category, COUNT(*) AS count
      FROM news_categories
      WHERE classified_at >= datetime('now', '-7 days')
      GROUP BY category
      ORDER BY count DESC
    `).all() as { category: string; count: number }[];

    // Source breakdown (last 7 days)
    const sourceBreakdown = db.prepare(`
      SELECT source, COUNT(*) AS count
      FROM articles
      WHERE fetched_at >= datetime('now', '-7 days')
      GROUP BY source
      ORDER BY count DESC
    `).all() as { source: string; count: number }[];

    // Daily articles for chart
    const dailyArticles = db.prepare(`
      SELECT date(fetched_at) AS day, COUNT(*) AS count
      FROM articles
      WHERE fetched_at >= datetime('now', '-14 days')
      GROUP BY date(fetched_at)
      ORDER BY day
    `).all() as { day: string; count: number }[];

    // --- System Health ---
    const schedulerErrors = db.prepare(`
      SELECT task_name, error_message, created_at
      FROM scheduler_errors
      ORDER BY created_at DESC
      LIMIT 20
    `).all() as { task_name: string; error_message: string; created_at: string }[];

    const errorsToday = (db.prepare(
      "SELECT COUNT(*) AS n FROM scheduler_errors WHERE date(created_at) = ?"
    ).get(today) as { n: number }).n;

    const errorsWeek = (db.prepare(
      "SELECT COUNT(*) AS n FROM scheduler_errors WHERE date(created_at) >= ?"
    ).get(weekAgo) as { n: number }).n;

    // Last fetch times
    const lastPriceFetch = (db.prepare("SELECT MAX(fetched_at) AS ts FROM prices").get() as { ts: string | null }).ts;
    const lastNewsFetch = (db.prepare("SELECT MAX(fetched_at) AS ts FROM articles").get() as { ts: string | null }).ts;
    const lastDigest = (db.prepare("SELECT MAX(generated_at) AS ts FROM digest_history").get() as { ts: string | null }).ts;

    // Digest subscribers
    const digestSubscribers = (db.prepare("SELECT COUNT(*) AS n FROM digest_subscribers WHERE active = 1").get() as { n: number }).n;

    // Push subscribers
    const pushSubscribers = (db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions").get() as { n: number }).n;

    res.json({
      users: {
        total: totalUsers,
        pro: proUsers,
        free: freeUsers,
        signupsToday,
        signupsWeek,
        dailySignups,
      },
      revenue: {
        activeSubscriptions,
        mrr,
        proPriceMonthly,
      },
      alerts: {
        total: totalAlerts,
        today: alertsToday,
        week: alertsWeek,
        missedToday: missedAlertsToday,
        channelBreakdown: channelCounts,
        dailyAlerts,
      },
      news: {
        totalArticles,
        articlesToday,
        articlesWeek,
        totalClassified,
        totalImpactEvents,
        categoryBreakdown,
        sourceBreakdown,
        dailyArticles,
      },
      system: {
        uptime: process.uptime ? Math.floor(process.uptime()) : 0,
        lastPriceFetch,
        lastNewsFetch,
        lastDigest,
        lastAlertCheck: schedulerStatus.alert?.lastRun ?? null,
        schedulers: schedulerStatus,
        errorsToday,
        errorsWeek,
        recentErrors: schedulerErrors,
      },
      subscribers: {
        digest: digestSubscribers,
        push: pushSubscribers,
      },
    });
  });

  return router;
}
