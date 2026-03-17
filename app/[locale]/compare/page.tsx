import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { CompareContent } from "./compare-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return {
    title: `${t("compare")} | Wavedge`,
  };
}

export default async function ComparePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <CompareContent locale={locale} />;
}
