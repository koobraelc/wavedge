import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { BillingContent } from "./billing-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return {
    title: `${t("billing")} | Wavedge`,
  };
}

export default async function BillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <BillingContent locale={locale} />;
}
