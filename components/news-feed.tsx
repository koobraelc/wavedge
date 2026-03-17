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
}

export function NewsFeed() {
  const t = useTranslations("feed");
  const { data, loading } = useFetch<Article[]>("/api/news?limit=15", {
    refreshInterval: 60_000,
  });

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-[var(--radius)] animate-pulse"
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
    <div className="space-y-2">
      {articles.map((article) => {
        const tags = article.token_tags ? JSON.parse(article.token_tags) : [];
        return (
          <a
            key={article.id}
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 rounded-[var(--radius-sm)] border no-underline transition-colors hover:bg-[var(--bg-tertiary)]"
            style={{
              background: "var(--bg-secondary)",
              borderColor: "var(--border)",
            }}
          >
            <h3 className="text-sm font-medium text-[var(--text-primary)] line-clamp-2">
              {article.title}
            </h3>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-[var(--text-muted)]">
              <span>{article.source}</span>
              <span>&middot;</span>
              <span>{timeAgo(article.published_at)}</span>
              {tags.slice(0, 2).map((tag: string) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 rounded text-[0.6rem]"
                  style={{
                    background: "var(--bg-tertiary)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </a>
        );
      })}
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
