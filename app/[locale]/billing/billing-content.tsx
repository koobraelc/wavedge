"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function BillingContent({ locale }: { locale: string }) {
  const t = useTranslations();
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);

  const handleCheckout = async () => {
    setLoading("checkout");
    try {
      const token = localStorage.getItem("wavedge_token");
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // error handled silently
    } finally {
      setLoading(null);
    }
  };

  const handlePortal = async () => {
    setLoading("portal");
    try {
      const token = localStorage.getItem("wavedge_token");
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // error handled silently
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">
        {t("nav.billing")}
      </h1>

      {/* Plans */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Free plan */}
        <div
          className="p-6 rounded-[var(--radius)]"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
          }}
        >
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            Free
          </h2>
          <p className="text-3xl font-bold text-[var(--text-primary)] mb-4">
            $0<span className="text-sm font-normal text-[var(--text-muted)]">/mo</span>
          </p>
          <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
            <li className="flex items-center gap-2">
              <span style={{ color: "var(--green)" }}>&#10003;</span>
              Top 50 tokens tracking
            </li>
            <li className="flex items-center gap-2">
              <span style={{ color: "var(--green)" }}>&#10003;</span>
              5 alerts per day
            </li>
            <li className="flex items-center gap-2">
              <span style={{ color: "var(--green)" }}>&#10003;</span>
              Web notifications
            </li>
            <li className="flex items-center gap-2">
              <span style={{ color: "var(--green)" }}>&#10003;</span>
              Daily AI digest
            </li>
            <li className="flex items-center gap-2 text-[var(--text-muted)]">
              <span>&#10007;</span>
              API access
            </li>
            <li className="flex items-center gap-2 text-[var(--text-muted)]">
              <span>&#10007;</span>
              Telegram/email alerts
            </li>
          </ul>
        </div>

        {/* Pro plan */}
        <div
          className="p-6 rounded-[var(--radius)] relative"
          style={{
            background: "var(--bg-secondary)",
            border: "2px solid var(--accent)",
          }}
        >
          <span
            className="absolute top-0 right-4 -translate-y-1/2 px-3 py-0.5 rounded-full text-xs font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Recommended
          </span>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            Pro
          </h2>
          <p className="text-3xl font-bold text-[var(--text-primary)] mb-4">
            $19<span className="text-sm font-normal text-[var(--text-muted)]">/mo</span>
          </p>
          <ul className="space-y-2 text-sm text-[var(--text-secondary)] mb-6">
            <li className="flex items-center gap-2">
              <span style={{ color: "var(--green)" }}>&#10003;</span>
              All 200+ tokens
            </li>
            <li className="flex items-center gap-2">
              <span style={{ color: "var(--green)" }}>&#10003;</span>
              Unlimited alerts
            </li>
            <li className="flex items-center gap-2">
              <span style={{ color: "var(--green)" }}>&#10003;</span>
              Telegram + email notifications
            </li>
            <li className="flex items-center gap-2">
              <span style={{ color: "var(--green)" }}>&#10003;</span>
              API access (100 req/day)
            </li>
            <li className="flex items-center gap-2">
              <span style={{ color: "var(--green)" }}>&#10003;</span>
              Real-time push notifications
            </li>
            <li className="flex items-center gap-2">
              <span style={{ color: "var(--green)" }}>&#10003;</span>
              No ads
            </li>
          </ul>
          <button
            onClick={handleCheckout}
            disabled={loading === "checkout"}
            className="w-full py-2 rounded-[var(--radius)] text-sm font-medium transition-colors"
            style={{
              background: "var(--accent)",
              color: "#fff",
              opacity: loading === "checkout" ? 0.6 : 1,
            }}
          >
            {loading === "checkout" ? "Redirecting..." : t("upgrade.cta")}
          </button>
        </div>
      </div>

      {/* Manage Subscription */}
      <div
        className="p-6 rounded-[var(--radius)]"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
        }}
      >
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
          Manage Subscription
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Already a Pro subscriber? Manage your billing, update payment method, or cancel.
        </p>
        <button
          onClick={handlePortal}
          disabled={loading === "portal"}
          className="px-4 py-2 rounded-[var(--radius)] text-sm font-medium transition-colors"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            opacity: loading === "portal" ? 0.6 : 1,
          }}
        >
          {loading === "portal" ? "Redirecting..." : "Open Billing Portal"}
        </button>
      </div>
    </div>
  );
}
