"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useFetch } from "@/lib/hooks/use-fetch";

interface AdminStats {
  users: {
    total: number;
    pro: number;
    free: number;
    signupsToday: number;
    signupsWeek: number;
    dailySignups: { day: string; count: number }[];
  };
  revenue: {
    activeSubscriptions: number;
    mrr: number;
    proPriceMonthly: number;
  };
  alerts: {
    total: number;
    today: number;
    week: number;
    missedToday: number;
    channelBreakdown: Record<string, number>;
    dailyAlerts: { day: string; count: number }[];
  };
  news: {
    totalArticles: number;
    articlesToday: number;
    articlesWeek: number;
    totalClassified: number;
    totalImpactEvents: number;
    categoryBreakdown: { category: string; count: number }[];
    sourceBreakdown: { source: string; count: number }[];
    dailyArticles: { day: string; count: number }[];
  };
  system: {
    lastPriceFetch: string | null;
    lastNewsFetch: string | null;
    lastDigest: string | null;
    errorsToday: number;
    errorsWeek: number;
    recentErrors: { task_name: string; error_message: string; created_at: string }[];
  };
  subscribers: {
    digest: number;
    push: number;
  };
}

export function AdminContent({ locale }: { locale: string }) {
  const token = typeof window !== "undefined" ? localStorage.getItem("wavedge_token") : null;
  const { data: stats, loading, error } = useFetch<AdminStats>(
    "/api/admin/stats",
    { refreshInterval: 60000 }
  );
  const [triggerLoading, setTriggerLoading] = useState<string | null>(null);

  const triggerCron = async (task: string) => {
    setTriggerLoading(task);
    try {
      await fetch(`/api/cron/${task}`, {
        method: "POST",
        headers: { "x-cron-secret": "manual-trigger" },
      });
    } catch {
      // silent
    } finally {
      setTriggerLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 text-center text-[var(--text-muted)]">
        Loading admin data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 text-center text-[var(--red)]">
        Access denied or failed to load admin data.
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">
        Admin Dashboard
      </h1>

      {/* Stats overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total Users" value={stats.users.total} sub={`${stats.users.pro} Pro / ${stats.users.free} Free`} />
        <MetricCard label="MRR" value={`$${stats.revenue.mrr}`} sub={`${stats.revenue.activeSubscriptions} active subs`} />
        <MetricCard label="Alerts Today" value={stats.alerts.today} sub={`${stats.alerts.missedToday} missed`} />
        <MetricCard label="Articles Today" value={stats.news.articlesToday} sub={`${stats.news.totalArticles} total`} />
      </div>

      {/* User signups & alerts trends */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card title="Signups (14d)">
          <MiniBarChart data={stats.users.dailySignups} />
          <div className="mt-2 text-xs text-[var(--text-muted)]">
            Today: {stats.users.signupsToday} / This week: {stats.users.signupsWeek}
          </div>
        </Card>
        <Card title="Alerts (14d)">
          <MiniBarChart data={stats.alerts.dailyAlerts} />
          <div className="mt-2 text-xs text-[var(--text-muted)]">
            Today: {stats.alerts.today} / This week: {stats.alerts.week}
          </div>
        </Card>
      </div>

      {/* News & content */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card title="Articles (14d)">
          <MiniBarChart data={stats.news.dailyArticles} />
          <div className="mt-2 text-xs text-[var(--text-muted)]">
            Classified: {stats.news.totalClassified} / Impact events: {stats.news.totalImpactEvents}
          </div>
        </Card>
        <Card title="Subscribers">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Digest subscribers</span>
              <span className="text-[var(--text-primary)] font-medium">{stats.subscribers.digest}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Push subscribers</span>
              <span className="text-[var(--text-primary)] font-medium">{stats.subscribers.push}</span>
            </div>
            {Object.entries(stats.alerts.channelBreakdown).map(([ch, count]) => (
              <div key={ch} className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">Alerts via {ch} (7d)</span>
                <span className="text-[var(--text-primary)] font-medium">{count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* News breakdown */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card title="Categories (7d)">
          <div className="space-y-1">
            {stats.news.categoryBreakdown.slice(0, 10).map((cat) => (
              <div key={cat.category} className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">{cat.category}</span>
                <span className="text-[var(--text-primary)] font-mono">{cat.count}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Sources (7d)">
          <div className="space-y-1">
            {stats.news.sourceBreakdown.slice(0, 10).map((src) => (
              <div key={src.source} className="flex justify-between text-sm">
                <span className="text-[var(--text-secondary)]">{src.source}</span>
                <span className="text-[var(--text-primary)] font-mono">{src.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* System health */}
      <Card title="System Health">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <HealthItem
            label="Last Price Fetch"
            value={stats.system.lastPriceFetch}
          />
          <HealthItem
            label="Last News Fetch"
            value={stats.system.lastNewsFetch}
          />
          <HealthItem
            label="Last Digest"
            value={stats.system.lastDigest}
          />
        </div>
        <div className="flex items-center gap-2 text-sm mb-4">
          <span className="text-[var(--text-secondary)]">Errors:</span>
          <span className="text-[var(--text-primary)]">
            Today: {stats.system.errorsToday} / Week: {stats.system.errorsWeek}
          </span>
        </div>
        {stats.system.recentErrors.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="text-left px-2 py-1 text-[var(--text-muted)]">Task</th>
                  <th className="text-left px-2 py-1 text-[var(--text-muted)]">Error</th>
                  <th className="text-left px-2 py-1 text-[var(--text-muted)]">Time</th>
                </tr>
              </thead>
              <tbody>
                {stats.system.recentErrors.slice(0, 10).map((err, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-2 py-1 text-[var(--text-primary)]">{err.task_name}</td>
                    <td className="px-2 py-1 text-[var(--red)] max-w-xs truncate">{err.error_message}</td>
                    <td className="px-2 py-1 text-[var(--text-muted)] whitespace-nowrap">
                      {new Date(err.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Manual cron triggers */}
      <Card title="Manual Cron Triggers">
        <div className="flex flex-wrap gap-2">
          {["price", "news", "alerts", "sentiment", "whales", "digest", "impact"].map((task) => (
            <button
              key={task}
              onClick={() => triggerCron(task)}
              disabled={triggerLoading === task}
              className="px-3 py-1.5 rounded-[var(--radius-sm)] text-sm font-medium transition-colors"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                opacity: triggerLoading === task ? 0.6 : 1,
              }}
            >
              {triggerLoading === task ? "..." : task}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="p-4 rounded-[var(--radius)]"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
    >
      <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3">{title}</h2>
      {children}
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div
      className="p-4 rounded-[var(--radius)]"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
    >
      <div className="text-xs text-[var(--text-muted)] mb-1">{label}</div>
      <div className="text-xl font-bold text-[var(--text-primary)]">{value}</div>
      <div className="text-xs text-[var(--text-muted)] mt-1">{sub}</div>
    </div>
  );
}

function HealthItem({ label, value }: { label: string; value: string | null }) {
  const isRecent = value ? (Date.now() - new Date(value).getTime()) < 30 * 60 * 1000 : false;
  return (
    <div>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="flex items-center gap-1 mt-1">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: isRecent ? "var(--green)" : "var(--yellow)" }}
        />
        <span className="text-sm text-[var(--text-primary)]">
          {value ? new Date(value).toLocaleString() : "Never"}
        </span>
      </div>
    </div>
  );
}

function MiniBarChart({ data }: { data: { day: string; count: number }[] }) {
  if (!data || data.length === 0) {
    return <div className="text-sm text-[var(--text-muted)]">No data</div>;
  }
  const maxCount = Math.max(...data.map((d) => Number(d.count)), 1);

  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d) => {
        const height = Math.max((Number(d.count) / maxCount) * 100, 4);
        return (
          <div
            key={d.day}
            className="flex-1 rounded-t-sm"
            style={{
              height: `${height}%`,
              background: "var(--accent)",
              opacity: 0.7,
            }}
            title={`${d.day}: ${d.count}`}
          />
        );
      })}
    </div>
  );
}
