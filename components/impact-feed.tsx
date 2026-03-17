"use client";

import { useTranslations } from "next-intl";
import { useFetch } from "@/lib/hooks/use-fetch";

interface Article {
  id: number;
  title: string;
  url: string;
  source: string;
  published_at: string;
  summary?: string;
  token_tags?: string;
  _impact?: {
    category: string;
    tokenImpacts: Array<{
      symbol: string;
      historical: { avgChange24h: number; sampleSize: number };
    }>;
  };
}

export function ImpactFeed() {
  const t = useTranslations("impact");
  const { data, loading } = useFetch<Article[]>("/api/news?limit=20&withImpact=true", {
    refreshInterval: 60_000,
  });

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-[var(--radius)] animate-pulse"
            style={{ background: "var(--bg-tertiary)" }}
          />
        ))}
      </div>
    );
  }

  const articles = data || [];

  if (articles.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">{t("noArticles")}</div>
    );
  }

  return (
    <div className="space-y-3">
      {articles.map((article) => {
        const tags = article.token_tags ? JSON.parse(article.token_tags) : [];
        const impact = article._impact?.tokenImpacts?.[0];

        return (
          <div
            key={article.id}
            className="p-4 rounded-[var(--radius)] border transition-colors hover:bg-[var(--bg-tertiary)]"
            style={{
              background: "var(--bg-secondary)",
              borderColor: "var(--border)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-sm text-[var(--text-primary)] hover:text-[var(--accent)] no-underline line-clamp-2"
                >
                  {article.title}
                </a>
                {article.summary && (
                  <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-1">
                    {article.summary}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2 text-xs text-[var(--text-muted)]">
                  <span>{article.source}</span>
                  <span>&middot;</span>
                  <span>{timeAgo(article.published_at)}</span>
                  {tags.length > 0 && (
                    <>
                      <span>&middot;</span>
                      {tags.slice(0, 3).map((tag: string) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 rounded text-[0.65rem] font-medium"
                          style={{
                            background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                            color: "var(--accent)",
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {impact && (
                <ImpactBadge
                  avgChange={impact.historical.avgChange24h}
                  sampleSize={impact.historical.sampleSize}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ImpactBadge({
  avgChange,
  sampleSize,
}: {
  avgChange: number;
  sampleSize: number;
}) {
  const isPositive = avgChange >= 0;
  return (
    <div
      className="shrink-0 px-2.5 py-1.5 rounded-full text-xs font-semibold text-center"
      style={{
        background: isPositive
          ? "color-mix(in srgb, var(--green) 12%, transparent)"
          : "color-mix(in srgb, var(--red) 12%, transparent)",
        color: isPositive ? "var(--green)" : "var(--red)",
      }}
      title={`n=${sampleSize}`}
    >
      {isPositive ? "+" : ""}{avgChange.toFixed(1)}%
      <div className="text-[0.6rem] opacity-70">n={sampleSize}</div>
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
