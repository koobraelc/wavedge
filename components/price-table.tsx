"use client";

import { useTranslations } from "next-intl";
import { useFetch } from "@/lib/hooks/use-fetch";

interface PriceRow {
  symbol: string;
  name: string;
  price_usd: number;
  current_price?: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
}

export function PriceTable({ locale }: { locale: string }) {
  const t = useTranslations("table");
  const { data, loading } = useFetch<PriceRow[]>("/api/prices", {
    refreshInterval: 30_000,
  });

  if (loading) {
    return (
      <div
        className="rounded-[var(--radius)] border p-6"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
      >
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 rounded" style={{ background: "var(--bg-tertiary)" }} />
          ))}
        </div>
      </div>
    );
  }

  const prices = data || [];

  if (prices.length === 0) {
    return (
      <div
        className="rounded-[var(--radius)] border p-8 text-center"
        style={{ background: "var(--bg-secondary)", borderColor: "var(--border)", color: "var(--text-muted)" }}
      >
        {t("noData")}
      </div>
    );
  }

  return (
    <div
      className="rounded-[var(--radius)] border overflow-hidden"
      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-left text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-muted)" }}
            >
              <th className="px-4 py-3" style={{ background: "var(--bg-tertiary)" }}>{t("rank")}</th>
              <th className="px-4 py-3" style={{ background: "var(--bg-tertiary)" }}>{t("token")}</th>
              <th className="px-4 py-3 text-right" style={{ background: "var(--bg-tertiary)" }}>{t("price")}</th>
              <th className="px-4 py-3 text-right" style={{ background: "var(--bg-tertiary)" }}>{t("change24h")}</th>
              <th className="px-4 py-3 text-right hidden md:table-cell" style={{ background: "var(--bg-tertiary)" }}>{t("marketCap")}</th>
              <th className="px-4 py-3 text-right hidden lg:table-cell" style={{ background: "var(--bg-tertiary)" }}>{t("volume")}</th>
            </tr>
          </thead>
          <tbody>
            {prices.map((row, i) => (
              <tr
                key={row.symbol}
                className="border-t hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
                style={{ borderColor: "var(--border)" }}
                onClick={() => window.location.href = `/${locale}/tokens/${row.symbol.toLowerCase()}`}
              >
                <td className="px-4 py-3 text-[var(--text-muted)]">{i + 1}</td>
                <td className="px-4 py-3">
                  <span className="font-semibold text-[var(--text-primary)]">{row.symbol}</span>
                  <span className="ml-2 text-[var(--text-muted)] hidden sm:inline">{row.name}</span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-[var(--text-primary)]">
                  ${formatPrice(row.price_usd || row.current_price || 0)}
                </td>
                <td
                  className="px-4 py-3 text-right font-mono font-medium"
                  style={{ color: row.price_change_percentage_24h >= 0 ? "var(--green)" : "var(--red)" }}
                >
                  {row.price_change_percentage_24h >= 0 ? "+" : ""}
                  {row.price_change_percentage_24h?.toFixed(2)}%
                </td>
                <td className="px-4 py-3 text-right font-mono text-[var(--text-secondary)] hidden md:table-cell">
                  ${formatCompact(row.market_cap)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-[var(--text-secondary)] hidden lg:table-cell">
                  ${formatCompact(row.total_volume)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatPrice(n: number): string {
  if (n >= 1) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

function formatCompact(n: number): string {
  if (!n) return "—";
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toFixed(2);
}
