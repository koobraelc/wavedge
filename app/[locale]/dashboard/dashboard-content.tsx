"use client";

import { useTranslations } from "next-intl";
import { useDashboardMode } from "@/components/providers/dashboard-mode-provider";
import { PriceTable } from "@/components/price-table";
import { SignalHeatmap } from "@/components/signal-heatmap";
import { ImpactFeed } from "@/components/impact-feed";
import { NewsFeed } from "@/components/news-feed";
import { WatchlistWidget } from "@/components/watchlist-widget";
import { AiDigest } from "@/components/ai-digest";

export function DashboardContent({ locale }: { locale: string }) {
  const t = useTranslations();
  const { mode } = useDashboardMode();

  if (mode === "beginner") {
    return <BeginnerDashboard locale={locale} t={t} />;
  }

  return <TraderDashboard locale={locale} t={t} />;
}

function BeginnerDashboard({
  locale,
  t,
}: {
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
      {/* AI Digest first for beginners */}
      <AiDigest locale={locale} />

      {/* Watchlist */}
      <section>
        <h2 className="text-lg font-semibold mb-3 text-[var(--text-primary)]">
          {t("watchlist.yourWatchlist")}
        </h2>
        <WatchlistWidget locale={locale} />
      </section>

      {/* Heatmap */}
      <section>
        <SignalHeatmap locale={locale} />
      </section>

      {/* Impact Feed */}
      <section>
        <h2 className="text-lg font-semibold mb-3 text-[var(--text-primary)]">
          Impact Feed
        </h2>
        <ImpactFeed />
      </section>

      {/* Price Table */}
      <section>
        <PriceTable locale={locale} />
      </section>
    </div>
  );
}

function TraderDashboard({
  locale,
  t,
}: {
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main content: 2 cols */}
        <div className="lg:col-span-2 space-y-6">
          {/* Heatmap */}
          <SignalHeatmap locale={locale} />

          {/* Price Table */}
          <PriceTable locale={locale} />

          {/* Impact Feed */}
          <section>
            <h2 className="text-lg font-semibold mb-3 text-[var(--text-primary)]">
              Impact Feed
            </h2>
            <ImpactFeed />
          </section>
        </div>

        {/* Sidebar: 1 col */}
        <div className="space-y-6">
          {/* Watchlist */}
          <section>
            <h2 className="text-lg font-semibold mb-3 text-[var(--text-primary)]">
              {t("watchlist.yourWatchlist")}
            </h2>
            <WatchlistWidget locale={locale} />
          </section>

          {/* News Feed */}
          <section>
            <h2 className="text-lg font-semibold mb-3 text-[var(--text-primary)]">
              News
            </h2>
            <NewsFeed />
          </section>

          {/* AI Digest */}
          <AiDigest locale={locale} />
        </div>
      </div>
    </div>
  );
}
