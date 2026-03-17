import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { AlertsContent } from "./alerts-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return {
    title: `${t("alerts")} | Wavedge`,
  };
}

export default async function AlertsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <AlertsContent locale={locale} />;
}
