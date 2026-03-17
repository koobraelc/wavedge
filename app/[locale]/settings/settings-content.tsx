"use client";

import { useTranslations } from "next-intl";
import { useTheme, themes, type Theme } from "@/components/providers/theme-provider";
import { useFontSize, fontSizes, type FontSize } from "@/components/providers/font-size-provider";
import { useDashboardMode, dashboardModes, type DashboardMode } from "@/components/providers/dashboard-mode-provider";
import { useRouter, usePathname } from "next/navigation";
import { ApiKeyManager } from "@/components/api-key-manager";

export function SettingsContent({ locale }: { locale: string }) {
  const t = useTranslations();
  const { theme, setTheme, themeLabels } = useTheme();
  const { fontSize, setFontSize, fontSizeLabels } = useFontSize();
  const { mode, setMode } = useDashboardMode();
  const router = useRouter();
  const pathname = usePathname();

  const localeLabels: Record<string, string> = {
    en: "English",
    "zh-tw": "繁體中文",
    ja: "日本語",
    ko: "한국어",
  };

  const handleLocaleChange = (newLocale: string) => {
    const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}(-[a-z]{2})?/, "");
    router.push(`/${newLocale}${pathWithoutLocale}`);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">
        {t("nav.settings")}
      </h1>

      {/* Language */}
      <Card title={t("nav.language")} icon="&#127760;">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {["en", "zh-tw", "ja", "ko"].map((loc) => (
            <button
              key={loc}
              onClick={() => handleLocaleChange(loc)}
              className="px-3 py-2 rounded-[var(--radius)] text-sm font-medium transition-colors"
              style={{
                background: locale === loc ? "var(--accent)" : "var(--bg-tertiary)",
                color: locale === loc ? "#fff" : "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            >
              {localeLabels[loc]}
            </button>
          ))}
        </div>
      </Card>

      {/* Theme */}
      <Card title={t("nav.switchTheme")} icon="&#127912;">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {themes.map((th) => (
            <button
              key={th}
              onClick={() => setTheme(th)}
              className="px-3 py-2 rounded-[var(--radius)] text-sm font-medium transition-colors"
              style={{
                background: theme === th ? "var(--accent)" : "var(--bg-tertiary)",
                color: theme === th ? "#fff" : "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            >
              {themeLabels[th]}
            </button>
          ))}
        </div>
      </Card>

      {/* Font Size */}
      <Card title={t("nav.fontSize")} icon="&#128291;">
        <div className="flex gap-2">
          {fontSizes.map((size) => (
            <button
              key={size}
              onClick={() => setFontSize(size)}
              className="px-4 py-2 rounded-[var(--radius)] text-sm font-medium transition-colors"
              style={{
                background: fontSize === size ? "var(--accent)" : "var(--bg-tertiary)",
                color: fontSize === size ? "#fff" : "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            >
              {fontSizeLabels[size]}
            </button>
          ))}
        </div>
      </Card>

      {/* Dashboard Mode */}
      <Card title={t("nav.dashboardMode")} icon="&#128202;">
        <div className="flex gap-2">
          {dashboardModes.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="px-4 py-2 rounded-[var(--radius)] text-sm font-medium transition-colors capitalize"
              style={{
                background: mode === m ? "var(--accent)" : "var(--bg-tertiary)",
                color: mode === m ? "#fff" : "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </Card>

      {/* API Keys */}
      <Card title={t("nav.apiKeys")} icon="&#128273;">
        <ApiKeyManager />
      </Card>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="p-4 rounded-[var(--radius)]"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span dangerouslySetInnerHTML={{ __html: icon }} />
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}
