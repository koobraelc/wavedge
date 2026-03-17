import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { Inter } from "next/font/google";
import { locales } from "@/i18n/config";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { FontSizeProvider } from "@/components/providers/font-size-provider";
import { DashboardModeProvider } from "@/components/providers/dashboard-mode-provider";
import { NavBar } from "@/components/nav-bar";
import "@/app/globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locales, locale)) {
    notFound();
  }

  const messages = (await import(`@/messages/${locale}.json`)).default;

  return (
    <html lang={locale} className={inter.variable} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>
            <FontSizeProvider>
              <DashboardModeProvider>
                <NavBar />
                <main className="min-h-screen">{children}</main>
              </DashboardModeProvider>
            </FontSizeProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
