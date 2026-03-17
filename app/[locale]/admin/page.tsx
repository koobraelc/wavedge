import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { AdminContent } from "./admin-content";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Admin | Wavedge",
  };
}

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <AdminContent locale={locale} />;
}
