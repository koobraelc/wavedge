"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useTheme, themes } from "@/components/providers/theme-provider";
import { useFontSize, fontSizes } from "@/components/providers/font-size-provider";
import { useDashboardMode, dashboardModes } from "@/components/providers/dashboard-mode-provider";
import { locales, localeNames, type Locale } from "@/i18n/config";

export function NavBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme, themeLabels } = useTheme();
  const { fontSize, setFontSize, fontSizeLabels } = useFontSize();
  const { mode, setMode } = useDashboardMode();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ symbol: string; name: string }>>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Extract current locale from pathname
  const currentLocale = (pathname.split("/")[1] || "en") as Locale;

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
      }
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search
  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (!query.trim()) {
        setSearchResults([]);
        setShowSearch(false);
        return;
      }
      searchTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=8`);
          if (res.ok) {
            const data = await res.json();
            setSearchResults(data.tokens || []);
            setShowSearch(true);
          }
        } catch {
          /* ignore search errors */
        }
      }, 300);
    },
    []
  );

  function switchLocale(locale: Locale) {
    const segments = pathname.split("/");
    segments[1] = locale;
    router.push(segments.join("/"));
  }

  function isActive(path: string) {
    const withoutLocale = pathname.replace(`/${currentLocale}`, "") || "/";
    return withoutLocale.startsWith(path);
  }

  return (
    <header
      className="sticky top-0 z-50 border-b flex items-center justify-between gap-4 px-4 py-3 md:px-6"
      style={{
        background: "var(--bg-primary)",
        borderColor: "var(--border)",
      }}
    >
      {/* Logo */}
      <a href={`/${currentLocale}/dashboard`} className="shrink-0 no-underline">
        <span className="text-xl font-bold text-[var(--text-primary)]">
          Wave<span className="text-[var(--accent)]">edge</span>
        </span>
      </a>

      {/* Search */}
      <div ref={searchRef} className="relative flex-1 max-w-[400px] hidden md:block">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          className="w-full py-2 px-4 pl-9 text-sm rounded-[var(--radius)] border outline-none transition-colors"
          style={{
            background: "var(--bg-secondary)",
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
          style={{ color: "var(--text-muted)" }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        {showSearch && searchResults.length > 0 && (
          <div
            className="absolute top-full left-0 right-0 mt-1 rounded-[var(--radius)] border overflow-hidden shadow-lg z-50"
            style={{
              background: "var(--bg-secondary)",
              borderColor: "var(--border)",
            }}
          >
            {searchResults.map((r) => (
              <a
                key={r.symbol}
                href={`/${currentLocale}/tokens/${r.symbol.toLowerCase()}`}
                className="flex items-center gap-2 px-4 py-2 text-sm no-underline hover:bg-[var(--bg-tertiary)] transition-colors"
                style={{ color: "var(--text-primary)" }}
                onClick={() => setShowSearch(false)}
              >
                <span className="font-semibold">{r.symbol}</span>
                <span style={{ color: "var(--text-muted)" }}>{r.name}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Desktop Nav */}
      <nav className="hidden md:flex items-center gap-4 text-sm">
        <NavLink
          href={`/${currentLocale}/dashboard`}
          active={isActive("/dashboard")}
        >
          {t("dashboard")}
        </NavLink>
        <NavLink
          href={`/${currentLocale}/market`}
          active={isActive("/market")}
        >
          {t("market")}
        </NavLink>
      </nav>

      {/* Settings Dropdown */}
      <div ref={settingsRef} className="relative hidden md:block">
        <button
          onClick={() => setSettingsOpen((o) => !o)}
          className="p-2 rounded-[var(--radius-sm)] border text-sm transition-colors"
          style={{
            background: "var(--bg-secondary)",
            borderColor: "var(--border)",
            color: "var(--text-secondary)",
          }}
          aria-label={t("settings")}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {settingsOpen && (
          <div
            className="absolute right-0 top-full mt-2 w-64 rounded-[var(--radius)] border shadow-xl overflow-hidden z-50"
            style={{
              background: "var(--bg-secondary)",
              borderColor: "var(--border)",
            }}
          >
            {/* Navigation Links */}
            <div className="p-2 border-b" style={{ borderColor: "var(--border)" }}>
              <SettingsLink href={`/${currentLocale}/alerts`}>{t("alertSettings")}</SettingsLink>
              <SettingsLink href={`/${currentLocale}/dashboard#watchlist`}>{t("watchlist")}</SettingsLink>
              <SettingsLink href={`/${currentLocale}/billing`}>{t("billing")}</SettingsLink>
            </div>

            {/* Theme */}
            <SettingsSection label={t("switchTheme")}>
              <div className="flex flex-wrap gap-1">
                {themes.map((t) => (
                  <SettingsButton
                    key={t}
                    active={theme === t}
                    onClick={() => setTheme(t)}
                  >
                    {themeLabels[t]}
                  </SettingsButton>
                ))}
              </div>
            </SettingsSection>

            {/* Language */}
            <SettingsSection label={t("language")}>
              <div className="flex flex-wrap gap-1">
                {locales.map((l) => (
                  <SettingsButton
                    key={l}
                    active={currentLocale === l}
                    onClick={() => switchLocale(l)}
                  >
                    {localeNames[l]}
                  </SettingsButton>
                ))}
              </div>
            </SettingsSection>

            {/* Font Size */}
            <SettingsSection label={t("fontSize")}>
              <div className="flex gap-1">
                {fontSizes.map((s) => (
                  <SettingsButton
                    key={s}
                    active={fontSize === s}
                    onClick={() => setFontSize(s)}
                  >
                    {fontSizeLabels[s]}
                  </SettingsButton>
                ))}
              </div>
            </SettingsSection>

            {/* Dashboard Mode */}
            <SettingsSection label={t("dashboardMode")}>
              <div className="flex gap-1">
                {dashboardModes.map((m) => (
                  <SettingsButton
                    key={m}
                    active={mode === m}
                    onClick={() => setMode(m)}
                  >
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </SettingsButton>
                ))}
              </div>
            </SettingsSection>
          </div>
        )}
      </div>

      {/* Mobile hamburger */}
      <button
        className="md:hidden p-2"
        onClick={() => setMobileMenuOpen((o) => !o)}
        aria-label="Menu"
        style={{ color: "var(--text-primary)" }}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {mobileMenuOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div
          className="absolute top-full left-0 right-0 border-b p-4 flex flex-col gap-3 md:hidden z-50"
          style={{
            background: "var(--bg-primary)",
            borderColor: "var(--border)",
          }}
        >
          <a
            href={`/${currentLocale}/dashboard`}
            className="text-sm font-medium no-underline"
            style={{ color: "var(--text-primary)" }}
          >
            {t("dashboard")}
          </a>
          <a
            href={`/${currentLocale}/market`}
            className="text-sm font-medium no-underline"
            style={{ color: "var(--text-primary)" }}
          >
            {t("market")}
          </a>
          <a
            href={`/${currentLocale}/alerts`}
            className="text-sm font-medium no-underline"
            style={{ color: "var(--text-secondary)" }}
          >
            {t("alertSettings")}
          </a>
          <a
            href={`/${currentLocale}/billing`}
            className="text-sm font-medium no-underline"
            style={{ color: "var(--text-secondary)" }}
          >
            {t("billing")}
          </a>
        </div>
      )}
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="font-medium no-underline transition-colors"
      style={{
        color: active ? "var(--accent)" : "var(--text-secondary)",
      }}
    >
      {children}
    </a>
  );
}

function SettingsLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="block px-3 py-1.5 text-sm rounded-[var(--radius-sm)] no-underline transition-colors hover:bg-[var(--bg-tertiary)]"
      style={{ color: "var(--text-secondary)" }}
    >
      {children}
    </a>
  );
}

function SettingsSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-2 border-b" style={{ borderColor: "var(--border)" }}>
      <span
        className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function SettingsButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 text-xs rounded-[var(--radius-sm)] transition-colors border"
      style={{
        background: active ? "color-mix(in srgb, var(--accent) 15%, transparent)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-secondary)",
        borderColor: active ? "var(--accent)" : "var(--border)",
      }}
    >
      {children}
    </button>
  );
}
