import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { SettingsContent } from "./settings-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return {
    title: `${t("settings")} | Wavedge`,
  };
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <SettingsContent locale={locale} />;
}
