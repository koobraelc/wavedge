"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useFetch } from "@/lib/hooks/use-fetch";

interface Token {
  symbol: string;
  name: string;
  price: number;
  change_percent_24h: number;
  market_cap: number;
  volume_24h: number;
}

type SectorKey = "l1" | "l2" | "stable" | "infra" | "other";

const SECTOR_TOKENS: Record<SectorKey, string[]> = {
  l1: ["BTC", "ETH", "SOL", "ADA", "AVAX", "DOT", "ATOM", "NEAR", "APT", "SUI"],
  l2: ["MATIC", "ARB", "OP", "IMX", "MANTA", "STRK", "ZK"],
  stable: ["USDT", "USDC", "DAI", "BUSD", "TUSD"],
  infra: ["LINK", "FIL", "GRT", "AR", "RNDR", "AKT"],
  other: [],
};

export function MarketContent({ locale }: { locale: string }) {
  const t = useTranslations("market");
  const tt = useTranslations("table");
  const { data: allTokens, loading, error } = useFetch<Token[]>("/api/prices", {
    refreshInterval: 30000,
  });

  const tokens = allTokens || [];

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 text-center text-[var(--text-muted)]">
        {t("loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 text-center text-[var(--red)]">
        {t("loadFailed")}
      </div>
    );
  }

  // Market stats
  const totalMarketCap = tokens.reduce((sum, tk) => sum + (tk.market_cap || 0), 0);
  const btc = tokens.find((tk) => tk.symbol.toUpperCase() === "BTC");
  const btcDominance = btc && totalMarketCap > 0 ? ((btc.market_cap || 0) / totalMarketCap) * 100 : 0;

  // Top gainers/losers
  const sorted = [...tokens].sort((a, b) => (b.change_percent_24h || 0) - (a.change_percent_24h || 0));
  const topGainers = sorted.slice(0, 5);
  const topLosers = sorted.slice(-5).reverse();

  // Sectors
  const knownSymbols = new Set(Object.values(SECTOR_TOKENS).flat());
  const sectorData = Object.entries(SECTOR_TOKENS).map(([key, symbols]) => {
    const sectorTokens = key === "other"
      ? tokens.filter((tk) => !knownSymbols.has(tk.symbol.toUpperCase()))
      : tokens.filter((tk) => symbols.includes(tk.symbol.toUpperCase()));
    const avgChange = sectorTokens.length > 0
      ? sectorTokens.reduce((s, tk) => s + (tk.change_percent_24h || 0), 0) / sectorTokens.length
      : 0;
    return { key: key as SectorKey, tokens: sectorTokens, avgChange };
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">
        Market Overview
      </h1>

      {/* Market stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Market Cap"
          value={fmtLarge(totalMarketCap)}
        />
        <StatCard
          label="BTC Dominance"
          value={`${btcDominance.toFixed(1)}%`}
        />
        <StatCard
          label="BTC Price"
          value={btc ? fmtPrice(btc.price) : "N/A"}
          change={btc?.change_percent_24h}
        />
        <StatCard
          label={`${tokens.length} ${t("tokens")}`}
          value="Tracked"
        />
      </div>

      {/* Gainers & Losers */}
      <div className="grid md:grid-cols-2 gap-6">
        <MoversList title="Top Gainers" tokens={topGainers} locale={locale} />
        <MoversList title="Top Losers" tokens={topLosers} locale={locale} />
      </div>

      {/* Sector heatmap */}
      <div
        className="p-4 rounded-[var(--radius)]"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4">
          Sector Performance (24h)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {sectorData.map((sector) => {
            const sectorLabels: Record<SectorKey, string> = {
              l1: t("sectorL1"),
              l2: t("sectorL2"),
              stable: t("sectorStable"),
              infra: t("sectorInfra"),
              other: t("sectorOther"),
            };
            return (
              <div
                key={sector.key}
                className="p-3 rounded-[var(--radius)] text-center"
                style={{
                  background: sector.avgChange >= 0
                    ? `rgba(63, 185, 80, ${Math.min(Math.abs(sector.avgChange) / 10, 0.3)})`
                    : `rgba(248, 81, 73, ${Math.min(Math.abs(sector.avgChange) / 10, 0.3)})`,
                  border: "1px solid var(--border)",
                }}
              >
                <div className="text-sm font-medium text-[var(--text-primary)]">
                  {sectorLabels[sector.key]}
                </div>
                <div
                  className="text-lg font-bold mt-1"
                  style={{
                    color: sector.avgChange >= 0 ? "var(--green)" : "var(--red)",
                  }}
                >
                  {sector.avgChange >= 0 ? "+" : ""}{sector.avgChange.toFixed(2)}%
                </div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  {sector.tokens.length} {t("tokens")}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Full token table */}
      <div
        className="rounded-[var(--radius)] overflow-x-auto"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">{tt("rank")}</th>
              <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">{tt("token")}</th>
              <th className="text-right px-4 py-3 text-[var(--text-muted)] font-medium">{tt("price")}</th>
              <th className="text-right px-4 py-3 text-[var(--text-muted)] font-medium">{tt("change24h")}</th>
              <th className="text-right px-4 py-3 text-[var(--text-muted)] font-medium hidden md:table-cell">{tt("marketCap")}</th>
              <th className="text-right px-4 py-3 text-[var(--text-muted)] font-medium hidden md:table-cell">{tt("volume")}</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((tk, i) => (
              <tr key={tk.symbol} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-4 py-3 text-[var(--text-muted)]">{i + 1}</td>
                <td className="px-4 py-3">
                  <a
                    href={`tokens/${tk.symbol.toLowerCase()}`}
                    className="text-[var(--link)] hover:underline font-medium"
                  >
                    {tk.symbol.toUpperCase()}
                  </a>
                  {tk.name && (
                    <span className="ml-2 text-[var(--text-muted)]">{tk.name}</span>
                  )}
                </td>
                <td className="text-right px-4 py-3 text-[var(--text-primary)] font-mono">
                  {fmtPrice(tk.price)}
                </td>
                <td
                  className="text-right px-4 py-3 font-mono font-medium"
                  style={{
                    color: (tk.change_percent_24h || 0) >= 0 ? "var(--green)" : "var(--red)",
                  }}
                >
                  {(tk.change_percent_24h || 0) >= 0 ? "+" : ""}
                  {(tk.change_percent_24h || 0).toFixed(2)}%
                </td>
                <td className="text-right px-4 py-3 text-[var(--text-secondary)] font-mono hidden md:table-cell">
                  {fmtLarge(tk.market_cap || 0)}
                </td>
                <td className="text-right px-4 py-3 text-[var(--text-secondary)] font-mono hidden md:table-cell">
                  {fmtLarge(tk.volume_24h || 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change?: number;
}) {
  return (
    <div
      className="p-4 rounded-[var(--radius)]"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
    >
      <div className="text-xs text-[var(--text-muted)] mb-1">{label}</div>
      <div className="text-lg font-bold text-[var(--text-primary)]">{value}</div>
      {change !== undefined && (
        <div
          className="text-sm font-medium mt-1"
          style={{ color: change >= 0 ? "var(--green)" : "var(--red)" }}
        >
          {change >= 0 ? "+" : ""}{change.toFixed(2)}%
        </div>
      )}
    </div>
  );
}

function MoversList({
  title,
  tokens,
  locale,
}: {
  title: string;
  tokens: Token[];
  locale: string;
}) {
  return (
    <div
      className="p-4 rounded-[var(--radius)]"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
    >
      <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3">
        {title}
      </h2>
      <div className="space-y-2">
        {tokens.map((tk) => (
          <div key={tk.symbol} className="flex items-center justify-between">
            <a
              href={`tokens/${tk.symbol.toLowerCase()}`}
              className="text-sm text-[var(--link)] hover:underline font-medium"
            >
              {tk.symbol.toUpperCase()}
            </a>
            <div className="flex items-center gap-3">
              <span className="text-sm text-[var(--text-secondary)] font-mono">
                {fmtPrice(tk.price)}
              </span>
              <span
                className="text-sm font-mono font-medium w-20 text-right"
                style={{
                  color: (tk.change_percent_24h || 0) >= 0 ? "var(--green)" : "var(--red)",
                }}
              >
                {(tk.change_percent_24h || 0) >= 0 ? "+" : ""}
                {(tk.change_percent_24h || 0).toFixed(2)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtPrice(n: number) {
  if (n >= 1) return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${n.toPrecision(4)}`;
}

function fmtLarge(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}
