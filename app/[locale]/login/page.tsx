"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const t = useTranslations();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError("");

    try {
      const { signIn } = await import("next-auth/react");
      const result = await signIn("resend", {
        email,
        redirect: false,
      });

      if (result?.error) {
        setError("Failed to send magic link. Please try again.");
      } else {
        setSubmitted(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-64px)] px-6">
        <div
          className="max-w-md w-full p-8 rounded-[var(--radius)] border text-center"
          style={{
            background: "var(--bg-secondary)",
            borderColor: "var(--border)",
          }}
        >
          <div className="text-4xl mb-4">📧</div>
          <h1 className="text-2xl font-bold mb-3 text-[var(--text-primary)]">
            Check your email
          </h1>
          <p className="text-[var(--text-secondary)] mb-6">
            We sent a magic link to <strong>{email}</strong>. Click the link in
            the email to sign in.
          </p>
          <button
            onClick={() => setSubmitted(false)}
            className="text-sm text-[var(--link)] hover:underline"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-64px)] px-6">
      <div
        className="max-w-md w-full p-8 rounded-[var(--radius)] border"
        style={{
          background: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        <h1 className="text-2xl font-bold mb-2 text-[var(--text-primary)]">
          {t("nav.login")}
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Enter your email to receive a magic link — no password needed.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium mb-1.5 text-[var(--text-secondary)]"
            >
              {t("alerts.emailAddress")}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("alerts.emailPlaceholder")}
              required
              className="w-full px-4 py-2.5 rounded-[var(--radius-sm)] border text-sm outline-none transition-colors"
              style={{
                background: "var(--bg-tertiary)",
                borderColor: "var(--border)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--red)]">{error}</p>
          )}

          <Button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full"
            size="lg"
          >
            {loading ? "Sending..." : "Send Magic Link"}
          </Button>
        </form>
      </div>
    </div>
  );
}
