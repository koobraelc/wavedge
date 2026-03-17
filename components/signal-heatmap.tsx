"use client";

import { useTranslations } from "next-intl";
import { useFetch } from "@/lib/hooks/use-fetch";

interface HeatmapData {
  prices: Array<{
    symbol: string;
    market_cap: number;
    price_change_percentage_24h: number;
    current_price: number;
  }>;
  newsSignals?: Record<string, { count: number }>;
  socialSentiment?: Record<string, { sentimentLabel: string }>;
  whaleActivity?: Record<string, { transactionCount: number }>;
}

export function SignalHeatmap({ locale }: { locale: string }) {
  const t = useTranslations("heatmap");
  const { data: prices, loading } = useFetch<HeatmapData["prices"]>("/api/prices", {
    refreshInterval: 60_000,
  });

  if (loading) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("title")}</h2>
        <div className="grid grid-cols-5 md:grid-cols-10 gap-1.5">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-[var(--radius-sm)] animate-pulse"
              style={{ background: "var(--bg-tertiary)" }}
            />
          ))}
        </div>
      </div>
    );
  }

  const tokens = (prices || []).slice(0, 50);

  if (tokens.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">{t("noData")}</div>
    );
  }

  const maxCap = Math.max(...tokens.map((t) => t.market_cap || 0));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("title")}</h2>
        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-[var(--green)]" /> {t("legendUp")}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-[var(--red)]" /> {t("legendDown")}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-5 md:grid-cols-10 gap-1.5">
        {tokens.map((token) => {
          const pct = token.price_change_percentage_24h || 0;
          const relSize = maxCap > 0 ? token.market_cap / maxCap : 0.5;
          const bgColor =
            pct > 0
              ? `rgba(${getGreenRgb()}, ${Math.min(0.15 + Math.abs(pct) * 0.03, 0.6)})`
              : pct < 0
                ? `rgba(${getRedRgb()}, ${Math.min(0.15 + Math.abs(pct) * 0.03, 0.6)})`
                : "var(--bg-tertiary)";

          return (
            <a
              key={token.symbol}
              href={`/${locale}/tokens/${token.symbol.toLowerCase()}`}
              className="flex flex-col items-center justify-center rounded-[var(--radius-sm)] border no-underline transition-transform hover:scale-105"
              style={{
                background: bgColor,
                borderColor: "var(--border)",
                aspectRatio: "1",
                fontSize: relSize > 0.3 ? "0.75rem" : "0.65rem",
              }}
            >
              <span className="font-bold text-[var(--text-primary)]">{token.symbol}</span>
              <span
                className="text-[0.65rem] font-mono"
                style={{ color: pct >= 0 ? "var(--green)" : "var(--red)" }}
              >
                {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function getGreenRgb(): string {
  return "63, 185, 80";
}

function getRedRgb(): string {
  return "248, 81, 73";
}
