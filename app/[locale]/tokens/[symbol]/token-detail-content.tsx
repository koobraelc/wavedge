"use client";

import { useTranslations } from "next-intl";
import { PriceChart } from "@/components/price-chart";
import { useFetch } from "@/lib/hooks/use-fetch";

interface TokenBatchData {
  price?: {
    symbol: string;
    name: string;
    current_price: number;
    price_change_percentage_24h: number;
    market_cap: number;
  };
  news?: Array<{
    id: number;
    title: string;
    url: string;
    source: string;
    published_at: string;
    summary?: string;
  }>;
  summary?: {
    content_html?: string;
    contentHtml?: string;
    generated_at?: string;
  };
  impact?: Array<{
    category: string;
    avg_change_24h: number;
    sample_size: number;
  }>;
}

export function TokenDetailContent({
  locale,
  symbol,
}: {
  locale: string;
  symbol: string;
}) {
  const t = useTranslations();
  const sym = symbol.toUpperCase();
  const { data, loading } = useFetch<TokenBatchData>(
    `/api/tokens/${symbol}/batch`,
    { refreshInterval: 30_000 }
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{sym}</h1>
        {data?.price && (
          <div className="flex items-center gap-3">
            <span className="text-2xl font-mono text-[var(--text-primary)]">
              ${data.price.current_price?.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
            <span
              className="text-sm font-semibold font-mono px-2 py-0.5 rounded"
              style={{
                color: (data.price.price_change_percentage_24h ?? 0) >= 0 ? "var(--green)" : "var(--red)",
                background:
                  (data.price.price_change_percentage_24h ?? 0) >= 0
                    ? "color-mix(in srgb, var(--green) 12%, transparent)"
                    : "color-mix(in srgb, var(--red) 12%, transparent)",
              }}
            >
              {(data.price.price_change_percentage_24h ?? 0) >= 0 ? "+" : ""}
              {data.price.price_change_percentage_24h?.toFixed(2)}%
            </span>
          </div>
        )}
      </div>

      {/* Chart */}
      <PriceChart symbol={symbol} />

      <div className="grid md:grid-cols-2 gap-6">
        {/* AI Summary */}
        <section>
          <h2 className="text-lg font-semibold mb-3 text-[var(--text-primary)]">
            AI Summary
          </h2>
          {loading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-4 w-full rounded" style={{ background: "var(--bg-tertiary)" }} />
              <div className="h-4 w-3/4 rounded" style={{ background: "var(--bg-tertiary)" }} />
            </div>
          ) : data?.summary?.content_html || data?.summary?.contentHtml ? (
            <div
              className="rounded-[var(--radius)] border p-4 text-sm leading-relaxed"
              style={{
                background: "var(--bg-secondary)",
                borderColor: "var(--border)",
                color: "var(--text-secondary)",
              }}
              dangerouslySetInnerHTML={{
                __html: (data.summary.content_html || data.summary.contentHtml)!,
              }}
            />
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No AI summary available yet.</p>
          )}
        </section>

        {/* Historical Impact */}
        <section>
          <h2 className="text-lg font-semibold mb-3 text-[var(--text-primary)]">
            {t("signal.historicalImpact")}
          </h2>
          {loading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-10 rounded" style={{ background: "var(--bg-tertiary)" }} />
              <div className="h-10 rounded" style={{ background: "var(--bg-tertiary)" }} />
            </div>
          ) : data?.impact && data.impact.length > 0 ? (
            <div
              className="rounded-[var(--radius)] border overflow-hidden"
              style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-[var(--text-muted)]">
                    <th className="px-3 py-2 text-left" style={{ background: "var(--bg-tertiary)" }}>
                      {t("signal.category")}
                    </th>
                    <th className="px-3 py-2 text-right" style={{ background: "var(--bg-tertiary)" }}>
                      {t("signal.avg24h")}
                    </th>
                    <th className="px-3 py-2 text-right" style={{ background: "var(--bg-tertiary)" }}>
                      {t("signal.samples")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.impact.map((row) => (
                    <tr
                      key={row.category}
                      className="border-t"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <td className="px-3 py-2 text-[var(--text-primary)] capitalize">{row.category}</td>
                      <td
                        className="px-3 py-2 text-right font-mono"
                        style={{ color: row.avg_change_24h >= 0 ? "var(--green)" : "var(--red)" }}
                      >
                        {row.avg_change_24h >= 0 ? "+" : ""}{row.avg_change_24h.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right text-[var(--text-muted)]">{row.sample_size}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">{t("signal.noImpactData")}</p>
          )}
        </section>
      </div>

      {/* Related News */}
      <section>
        <h2 className="text-lg font-semibold mb-3 text-[var(--text-primary)]">
          {t("signal.news")}
        </h2>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-[var(--radius)] animate-pulse" style={{ background: "var(--bg-tertiary)" }} />
            ))}
          </div>
        ) : data?.news && data.news.length > 0 ? (
          <div className="space-y-2">
            {data.news.map((article) => (
              <a
                key={article.id}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3 rounded-[var(--radius-sm)] border no-underline transition-colors hover:bg-[var(--bg-tertiary)]"
                style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
              >
                <h3 className="text-sm font-medium text-[var(--text-primary)] line-clamp-2">
                  {article.title}
                </h3>
                <div className="flex gap-2 mt-1 text-xs text-[var(--text-muted)]">
                  <span>{article.source}</span>
                  <span>&middot;</span>
                  <span>{timeAgo(article.published_at)}</span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">{t("signal.noRecentNews", { symbol: sym })}</p>
        )}
      </section>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
