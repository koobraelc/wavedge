"use client";

import { useTranslations } from "next-intl";
import { useFetch } from "@/lib/hooks/use-fetch";

interface DigestData {
  generated_at: string;
  content_html?: string;
  contentHtml?: string;
}

export function AiDigest({ locale }: { locale: string }) {
  const t = useTranslations("digest");
  const lang = locale === "zh-tw" ? "zh" : locale;
  const { data, loading } = useFetch<DigestData>(
    `/api/digest/latest?lang=${lang}`
  );

  if (loading) {
    return (
      <div
        className="rounded-[var(--radius)] border p-6"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
      >
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-40 rounded" style={{ background: "var(--bg-tertiary)" }} />
          <div className="h-4 w-full rounded" style={{ background: "var(--bg-tertiary)" }} />
          <div className="h-4 w-3/4 rounded" style={{ background: "var(--bg-tertiary)" }} />
        </div>
      </div>
    );
  }

  const html = data?.content_html || data?.contentHtml;

  if (!html) {
    return (
      <div
        className="rounded-[var(--radius)] border p-6 text-center"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
      >
        <p className="text-sm text-[var(--text-muted)]">{t("noDigest")}</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-[var(--radius)] border p-6"
      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🤖</span>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("title")}</h2>
        {data?.generated_at && (
          <span className="text-xs text-[var(--text-muted)] ml-auto">
            {timeAgo(data.generated_at)}
          </span>
        )}
      </div>
      <div
        className="prose prose-sm max-w-none text-[var(--text-secondary)]"
        style={{ lineHeight: "1.7" }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
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
