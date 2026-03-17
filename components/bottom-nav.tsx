"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

export function BottomNav() {
  const t = useTranslations("bottomNav");
  const pathname = usePathname();

  // Extract locale-less path
  const path = pathname.replace(/^\/[a-z]{2}(-[a-z]{2})?/, "") || "/";

  const items = [
    { href: "dashboard", label: t("dashboard"), icon: "\u25A0", match: (p: string) => p === "/dashboard" },
    { href: "market", label: t("market"), icon: "\u25A6", match: (p: string) => p === "/market" || p.startsWith("/tokens/") },
    { href: "alerts", label: t("alerts"), icon: "\u26A0", match: (p: string) => p === "/alerts" },
    { href: "settings", label: t("settings"), icon: "\u2699", match: (p: string) => p === "/settings" },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{
        background: "var(--bg-primary)",
        borderTop: "1px solid var(--border)",
      }}
      role="navigation"
      aria-label="Mobile navigation"
    >
      <div className="flex justify-around items-center h-14">
        {items.map((item) => {
          const isActive = item.match(path);
          return (
            <a
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 py-1 px-3 text-xs transition-colors"
              style={{
                color: isActive ? "var(--accent)" : "var(--text-muted)",
              }}
              aria-label={item.label}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
