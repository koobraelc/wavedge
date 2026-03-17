import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { MarketContent } from "./market-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return {
    title: `${t("market")} | Wavedge`,
  };
}

export default async function MarketPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <MarketContent locale={locale} />;
}
