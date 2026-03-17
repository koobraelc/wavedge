"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

interface PricePoint {
  fetched_at: string;
  price_usd: number;
}

export function PriceChart({ symbol }: { symbol: string }) {
  const t = useTranslations("chart");
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof import("lightweight-charts").createChart> | null>(null);
  const [chartType, setChartType] = useState<"line" | "candlestick">(
    () => (typeof window !== "undefined" && localStorage.getItem("wavedge_chart_type") as "line" | "candlestick") || "line"
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function initChart() {
      if (!containerRef.current) return;
      setLoading(true);
      setError("");

      try {
        const [{ createChart, ColorType, LineSeries }, res] = await Promise.all([
          import("lightweight-charts"),
          fetch(`/api/prices/${symbol}/history?limit=500`),
        ]);

        if (cancelled) return;
        if (!res.ok) throw new Error("Failed to load data");

        const json = await res.json();
        const points: PricePoint[] = json.data || [];

        if (points.length === 0) {
          setError(t("noData"));
          setLoading(false);
          return;
        }

        // Clean up previous chart
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
        }

        const chart = createChart(containerRef.current, {
          width: containerRef.current.clientWidth,
          height: 300,
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: "var(--text-secondary)",
          },
          grid: {
            vertLines: { color: "rgba(128, 128, 128, 0.1)" },
            horzLines: { color: "rgba(128, 128, 128, 0.1)" },
          },
          crosshair: {
            vertLine: { labelBackgroundColor: "#333" },
            horzLine: { labelBackgroundColor: "#333" },
          },
          timeScale: { timeVisible: true },
        });

        chartRef.current = chart;

        const sortedPoints = points.sort(
          (a, b) => new Date(a.fetched_at).getTime() - new Date(b.fetched_at).getTime()
        );

        const lineData = sortedPoints.map((p) => ({
          time: Math.floor(new Date(p.fetched_at).getTime() / 1000) as import("lightweight-charts").UTCTimestamp,
          value: p.price_usd,
        }));

        const series = chart.addSeries(LineSeries, {
          color: "#1f6feb",
          lineWidth: 2,
          crosshairMarkerVisible: true,
        });
        series.setData(lineData);

        chart.timeScale().fitContent();

        // Resize observer
        const observer = new ResizeObserver(() => {
          if (containerRef.current && chartRef.current) {
            chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
          }
        });
        observer.observe(containerRef.current);

        setLoading(false);

        return () => observer.disconnect();
      } catch {
        if (!cancelled) {
          setError(t("failed"));
          setLoading(false);
        }
      }
    }

    initChart();
    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [symbol, chartType, t]);

  return (
    <div
      className="rounded-[var(--radius)] border overflow-hidden"
      style={{ background: "var(--bg-secondary)", borderColor: "var(--border)" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <h3 className="font-semibold text-[var(--text-primary)]">
          {symbol.toUpperCase()} Price
        </h3>
        <div className="flex gap-1">
          <button
            onClick={() => {
              setChartType("line");
              localStorage.setItem("wavedge_chart_type", "line");
            }}
            className="px-2.5 py-1 text-xs rounded-[var(--radius-sm)] transition-colors"
            style={{
              background: chartType === "line" ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent",
              color: chartType === "line" ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {t("line")}
          </button>
          <button
            onClick={() => {
              setChartType("candlestick");
              localStorage.setItem("wavedge_chart_type", "candlestick");
            }}
            className="px-2.5 py-1 text-xs rounded-[var(--radius-sm)] transition-colors"
            style={{
              background: chartType === "candlestick" ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent",
              color: chartType === "candlestick" ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {t("candlestick")}
          </button>
        </div>
      </div>

      <div className="relative" style={{ minHeight: 300 }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--text-muted)]">
            {t("loading")}
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--text-muted)]">
            {error}
          </div>
        )}
        <div ref={containerRef} />
      </div>
    </div>
  );
}
