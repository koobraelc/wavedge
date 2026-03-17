import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { TokenDetailContent } from "./token-detail-content";

export const revalidate = 30; // ISR: revalidate every 30s

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; symbol: string }>;
}): Promise<Metadata> {
  const { locale, symbol } = await params;
  const sym = symbol.toUpperCase();

  return {
    title: `${sym} Price, News & Analysis | Wavedge`,
    description: `Real-time ${sym} price chart, AI-powered news analysis, impact scores, and whale activity tracking.`,
    openGraph: {
      title: `${sym} - Wavedge`,
      description: `${sym} price, news, and crypto intelligence.`,
    },
    alternates: {
      languages: {
        en: `/en/tokens/${symbol}`,
        "zh-tw": `/zh-tw/tokens/${symbol}`,
        ja: `/ja/tokens/${symbol}`,
        ko: `/ko/tokens/${symbol}`,
      },
    },
  };
}

export default async function TokenDetailPage({
  params,
}: {
  params: Promise<{ locale: string; symbol: string }>;
}) {
  const { locale, symbol } = await params;
  return <TokenDetailContent locale={locale} symbol={symbol} />;
}
