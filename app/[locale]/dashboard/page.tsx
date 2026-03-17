import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { DashboardContent } from "./dashboard-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return {
    title: `${t("dashboard")} | Wavedge`,
  };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <DashboardContent locale={locale} />;
}
