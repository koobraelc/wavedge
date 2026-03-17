"use client";

import { useTranslations } from "next-intl";
import { useFetch } from "@/lib/hooks/use-fetch";

interface WatchlistToken {
  symbol: string;
  name: string;
  price: number;
  change_24h: number;
  news_count_24h: number;
}

export function WatchlistWidget({ locale }: { locale: string }) {
  const t = useTranslations("watchlist");
  const { data, loading } = useFetch<{ tokens: WatchlistToken[] }>(
    "/api/homepage/watchlist",
    { refreshInterval: 30_000 }
  );

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-12 rounded-[var(--radius-sm)] animate-pulse"
            style={{ background: "var(--bg-tertiary)" }}
          />
        ))}
      </div>
    );
  }

  const tokens = data?.tokens || [];

  if (tokens.length === 0) {
    return (
      <div
        className="rounded-[var(--radius)] border p-6 text-center"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
      >
        <p className="text-sm text-[var(--text-muted)] mb-2">{t("emptyTitle")}</p>
        <a
          href={`/${locale}/alerts`}
          className="text-sm text-[var(--link)] hover:underline"
        >
          {t("emptyAction")}
        </a>
      </div>
    );
  }

  return (
    <div
      className="rounded-[var(--radius)] border overflow-hidden"
      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs font-semibold uppercase text-[var(--text-muted)]">
            <th className="px-3 py-2 text-left" style={{ background: "var(--bg-tertiary)" }}>{t("token")}</th>
            <th className="px-3 py-2 text-right" style={{ background: "var(--bg-tertiary)" }}>{t("price")}</th>
            <th className="px-3 py-2 text-right" style={{ background: "var(--bg-tertiary)" }}>{t("change24h")}</th>
            <th className="px-3 py-2 text-right" style={{ background: "var(--bg-tertiary)" }}>{t("signals")}</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => (
            <tr
              key={token.symbol}
              className="border-t hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
              style={{ borderColor: "var(--border)" }}
              onClick={() => window.location.href = `/${locale}/tokens/${token.symbol.toLowerCase()}`}
            >
              <td className="px-3 py-2">
                <span className="font-semibold text-[var(--text-primary)]">{token.symbol}</span>
                <span className="ml-1.5 text-[var(--text-muted)] text-xs">{token.name}</span>
              </td>
              <td className="px-3 py-2 text-right font-mono text-[var(--text-primary)]">
                ${token.price?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td
                className="px-3 py-2 text-right font-mono font-medium"
                style={{ color: token.change_24h >= 0 ? "var(--green)" : "var(--red)" }}
              >
                {token.change_24h >= 0 ? "+" : ""}{token.change_24h?.toFixed(2)}%
              </td>
              <td className="px-3 py-2 text-right">
                {token.news_count_24h > 0 && (
                  <span
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
                    style={{
                      background: "color-mix(in srgb, var(--yellow) 15%, transparent)",
                      color: "var(--yellow)",
                    }}
                  >
                    {token.news_count_24h}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
