import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/services/auth";
import { getPool } from "@/lib/db/database";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

export async function GET(request: NextRequest) {
  const result = await requireAuth(request);
  if (result instanceof NextResponse) return result;

  if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(result.email.toLowerCase())) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const pool = getPool();

    // --- Users ---
    const totalUsersResult = await pool.query("SELECT COUNT(*) AS n FROM users");
    const totalUsers = parseInt(totalUsersResult.rows[0].n);
    const proUsersResult = await pool.query("SELECT COUNT(*) AS n FROM users WHERE tier = 'pro'");
    const proUsers = parseInt(proUsersResult.rows[0].n);
    const freeUsers = totalUsers - proUsers;

    const today = new Date().toISOString().split("T")[0];
    const signupsTodayResult = await pool.query("SELECT COUNT(*) AS n FROM users WHERE date(created_at) = $1", [today]);
    const signupsToday = parseInt(signupsTodayResult.rows[0].n);

    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const signupsWeekResult = await pool.query("SELECT COUNT(*) AS n FROM users WHERE date(created_at) >= $1", [weekAgo]);
    const signupsWeek = parseInt(signupsWeekResult.rows[0].n);

    const dailySignupsResult = await pool.query(`
      SELECT date(created_at) AS day, COUNT(*) AS count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '14 days'
      GROUP BY date(created_at)
      ORDER BY day
    `);
    const dailySignups = dailySignupsResult.rows as { day: string; count: number }[];

    // --- Subscriptions & MRR ---
    const activeSubscriptionsResult = await pool.query(
      "SELECT COUNT(*) AS n FROM subscriptions WHERE status IN ('active', 'trialing')"
    );
    const activeSubscriptions = parseInt(activeSubscriptionsResult.rows[0].n);
    const proPriceMonthly = Number(process.env.PRO_PRICE_MONTHLY || "19");
    const mrr = activeSubscriptions * proPriceMonthly;

    // --- Alerts ---
    const totalAlertsResult = await pool.query("SELECT COUNT(*) AS n FROM triggered_alerts");
    const totalAlerts = parseInt(totalAlertsResult.rows[0].n);
    const alertsTodayResult = await pool.query(
      "SELECT COUNT(*) AS n FROM triggered_alerts WHERE date(created_at) = $1", [today]
    );
    const alertsToday = parseInt(alertsTodayResult.rows[0].n);
    const alertsWeekResult = await pool.query(
      "SELECT COUNT(*) AS n FROM triggered_alerts WHERE date(created_at) >= $1", [weekAgo]
    );
    const alertsWeek = parseInt(alertsWeekResult.rows[0].n);

    const missedAlertsTodayResult = await pool.query(
      "SELECT COUNT(*) AS n FROM missed_alerts WHERE date(created_at) = $1", [today]
    );
    const missedAlertsToday = parseInt(missedAlertsTodayResult.rows[0].n);

    const recentAlertsResult = await pool.query(
      "SELECT delivered_channels FROM triggered_alerts WHERE date(created_at) >= $1", [weekAgo]
    );
    const recentAlerts = recentAlertsResult.rows as { delivered_channels: string }[];

    const channelCounts: Record<string, number> = {};
    for (const a of recentAlerts) {
      try {
        const channels = JSON.parse(a.delivered_channels) as string[];
        for (const ch of channels) {
          channelCounts[ch] = (channelCounts[ch] || 0) + 1;
        }
      } catch { /* skip */ }
    }

    const dailyAlertsResult = await pool.query(`
      SELECT date(created_at) AS day, COUNT(*) AS count
      FROM triggered_alerts
      WHERE created_at >= NOW() - INTERVAL '14 days'
      GROUP BY date(created_at)
      ORDER BY day
    `);
    const dailyAlerts = dailyAlertsResult.rows as { day: string; count: number }[];

    // --- News ---
    const totalArticlesResult = await pool.query("SELECT COUNT(*) AS n FROM articles");
    const totalArticles = parseInt(totalArticlesResult.rows[0].n);
    const articlesTodayResult = await pool.query(
      "SELECT COUNT(*) AS n FROM articles WHERE date(fetched_at) = $1", [today]
    );
    const articlesToday = parseInt(articlesTodayResult.rows[0].n);
    const articlesWeekResult = await pool.query(
      "SELECT COUNT(*) AS n FROM articles WHERE date(fetched_at) >= $1", [weekAgo]
    );
    const articlesWeek = parseInt(articlesWeekResult.rows[0].n);

    const totalClassifiedResult = await pool.query("SELECT COUNT(*) AS n FROM news_categories");
    const totalClassified = parseInt(totalClassifiedResult.rows[0].n);
    const totalImpactEventsResult = await pool.query("SELECT COUNT(*) AS n FROM impact_events");
    const totalImpactEvents = parseInt(totalImpactEventsResult.rows[0].n);

    const categoryBreakdownResult = await pool.query(`
      SELECT category, COUNT(*) AS count
      FROM news_categories
      WHERE classified_at >= NOW() - INTERVAL '7 days'
      GROUP BY category
      ORDER BY count DESC
    `);
    const categoryBreakdown = categoryBreakdownResult.rows as { category: string; count: number }[];

    const sourceBreakdownResult = await pool.query(`
      SELECT source, COUNT(*) AS count
      FROM articles
      WHERE fetched_at >= NOW() - INTERVAL '7 days'
      GROUP BY source
      ORDER BY count DESC
    `);
    const sourceBreakdown = sourceBreakdownResult.rows as { source: string; count: number }[];

    const dailyArticlesResult = await pool.query(`
      SELECT date(fetched_at) AS day, COUNT(*) AS count
      FROM articles
      WHERE fetched_at >= NOW() - INTERVAL '14 days'
      GROUP BY date(fetched_at)
      ORDER BY day
    `);
    const dailyArticles = dailyArticlesResult.rows as { day: string; count: number }[];

    // --- System Health ---
    const schedulerErrorsResult = await pool.query(`
      SELECT task_name, error_message, created_at
      FROM scheduler_errors
      ORDER BY created_at DESC
      LIMIT 20
    `);
    const schedulerErrors = schedulerErrorsResult.rows as { task_name: string; error_message: string; created_at: string }[];

    const errorsTodayResult = await pool.query(
      "SELECT COUNT(*) AS n FROM scheduler_errors WHERE date(created_at) = $1", [today]
    );
    const errorsToday = parseInt(errorsTodayResult.rows[0].n);

    const errorsWeekResult = await pool.query(
      "SELECT COUNT(*) AS n FROM scheduler_errors WHERE date(created_at) >= $1", [weekAgo]
    );
    const errorsWeek = parseInt(errorsWeekResult.rows[0].n);

    const lastPriceFetchResult = await pool.query("SELECT MAX(fetched_at) AS ts FROM prices");
    const lastPriceFetch = lastPriceFetchResult.rows[0].ts;
    const lastNewsFetchResult = await pool.query("SELECT MAX(fetched_at) AS ts FROM articles");
    const lastNewsFetch = lastNewsFetchResult.rows[0].ts;
    const lastDigestResult = await pool.query("SELECT MAX(generated_at) AS ts FROM digest_history");
    const lastDigest = lastDigestResult.rows[0].ts;

    const digestSubscribersResult = await pool.query("SELECT COUNT(*) AS n FROM digest_subscribers WHERE active = true");
    const digestSubscribers = parseInt(digestSubscribersResult.rows[0].n);

    const pushSubscribersResult = await pool.query("SELECT COUNT(*) AS n FROM push_subscriptions");
    const pushSubscribers = parseInt(pushSubscribersResult.rows[0].n);

    return NextResponse.json({
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
        lastPriceFetch,
        lastNewsFetch,
        lastDigest,
        errorsToday,
        errorsWeek,
        recentErrors: schedulerErrors,
      },
      subscribers: {
        digest: digestSubscribers,
        push: pushSubscribers,
      },
    });
  } catch (err) {
    console.error("[Admin] Stats error:", err);
    return NextResponse.json({ error: "Failed to fetch admin stats" }, { status: 500 });
  }
}
