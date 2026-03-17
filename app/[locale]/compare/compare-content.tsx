"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useFetch } from "@/lib/hooks/use-fetch";
import { PriceChart } from "@/components/price-chart";

interface Token {
  symbol: string;
  name: string;
  price: number;
  change_percent_24h: number;
  market_cap: number;
  volume_24h: number;
}

export function CompareContent({ locale }: { locale: string }) {
  const t = useTranslations();
  const { data: allTokens, loading } = useFetch<Token[]>("/api/prices", {
    refreshInterval: 30000,
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const tokens = allTokens || [];
  const filteredTokens = tokens.filter(
    (tk) =>
      !selected.includes(tk.symbol.toUpperCase()) &&
      (tk.symbol.toLowerCase().includes(search.toLowerCase()) ||
        (tk.name || "").toLowerCase().includes(search.toLowerCase()))
  );

  const selectedTokens = selected
    .map((s) => tokens.find((tk) => tk.symbol.toUpperCase() === s))
    .filter(Boolean) as Token[];

  const addToken = (symbol: string) => {
    const upper = symbol.toUpperCase();
    if (!selected.includes(upper) && selected.length < 4) {
      setSelected([...selected, upper]);
    }
    setSearch("");
  };

  const removeToken = (symbol: string) => {
    setSelected(selected.filter((s) => s !== symbol));
  };

  const fmtPrice = (n: number) => {
    if (n >= 1) return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `$${n.toPrecision(4)}`;
  };

  const fmtLarge = (n: number) => {
    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    return `$${n.toLocaleString()}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">
        {t("nav.compare")}
      </h1>

      {/* Token selector */}
      <div
        className="p-4 rounded-[var(--radius)]"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
      >
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {selected.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-[var(--radius-sm)] text-sm font-medium"
              style={{
                background: "var(--accent)",
                color: "#fff",
              }}
            >
              {s}
              <button
                onClick={() => removeToken(s)}
                className="ml-1 hover:opacity-70"
                aria-label={`Remove ${s}`}
              >
                &times;
              </button>
            </span>
          ))}
          {selected.length < 4 && (
            <div className="relative">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={selected.length === 0 ? "Add tokens to compare..." : "Add more..."}
                className="px-3 py-1.5 rounded-[var(--radius-sm)] text-sm w-48"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                }}
              />
              {search && filteredTokens.length > 0 && (
                <div
                  className="absolute top-full left-0 mt-1 w-56 max-h-48 overflow-y-auto rounded-[var(--radius)] z-10"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                >
                  {filteredTokens.slice(0, 10).map((tk) => (
                    <button
                      key={tk.symbol}
                      onClick={() => addToken(tk.symbol)}
                      className="w-full text-left px-3 py-2 text-sm hover:opacity-80"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {tk.symbol.toUpperCase()} - {tk.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Select up to 4 tokens to compare side by side.
        </p>
      </div>

      {selected.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-muted)]">
          Add tokens above to start comparing.
        </div>
      ) : (
        <>
          {/* Charts grid */}
          <div className={`grid gap-6 ${selected.length === 1 ? "grid-cols-1" : "md:grid-cols-2"}`}>
            {selected.map((symbol) => (
              <div
                key={symbol}
                className="p-4 rounded-[var(--radius)]"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
              >
                <h3 className="text-base font-semibold text-[var(--text-primary)] mb-3">
                  {symbol}
                </h3>
                <PriceChart symbol={symbol.toLowerCase()} />
              </div>
            ))}
          </div>

          {/* Comparison table */}
          {selectedTokens.length > 0 && (
            <div
              className="rounded-[var(--radius)] overflow-x-auto"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">
                      Metric
                    </th>
                    {selectedTokens.map((tk) => (
                      <th
                        key={tk.symbol}
                        className="text-right px-4 py-3 text-[var(--text-muted)] font-medium"
                      >
                        {tk.symbol.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {t("table.price")}
                    </td>
                    {selectedTokens.map((tk) => (
                      <td key={tk.symbol} className="text-right px-4 py-3 text-[var(--text-primary)] font-mono">
                        {fmtPrice(tk.price)}
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {t("table.change24h")}
                    </td>
                    {selectedTokens.map((tk) => (
                      <td
                        key={tk.symbol}
                        className="text-right px-4 py-3 font-mono font-medium"
                        style={{
                          color: (tk.change_percent_24h || 0) >= 0 ? "var(--green)" : "var(--red)",
                        }}
                      >
                        {(tk.change_percent_24h || 0) >= 0 ? "+" : ""}
                        {(tk.change_percent_24h || 0).toFixed(2)}%
                      </td>
                    ))}
                  </tr>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {t("table.marketCap")}
                    </td>
                    {selectedTokens.map((tk) => (
                      <td key={tk.symbol} className="text-right px-4 py-3 text-[var(--text-primary)] font-mono">
                        {fmtLarge(tk.market_cap || 0)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {t("table.volume")}
                    </td>
                    {selectedTokens.map((tk) => (
                      <td key={tk.symbol} className="text-right px-4 py-3 text-[var(--text-primary)] font-mono">
                        {fmtLarge(tk.volume_24h || 0)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
