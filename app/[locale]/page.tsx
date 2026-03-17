import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });

  return {
    title: "Wavedge - Know Everything About Crypto",
    description:
      "AI-powered crypto intelligence: every news article comes with a quantified price impact score. Get alerts when multiple signals fire together.",
    openGraph: {
      title: "Wavedge - Know Everything About Crypto",
      description:
        "AI-powered crypto intelligence with price impact scores and multi-signal alerts.",
      type: "website",
      locale,
    },
    alternates: {
      languages: {
        en: "/en",
        "zh-tw": "/zh-tw",
        ja: "/ja",
        ko: "/ko",
      },
    },
  };
}

export default function LandingPage() {
  const t = useTranslations();

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-6 py-24 md:py-32 text-center">
        <h1 className="text-4xl md:text-6xl font-bold mb-6 text-[var(--text-primary)] leading-tight">
          Know Everything
          <br />
          About <span className="text-[var(--accent)]">Crypto</span>
        </h1>
        <p className="text-lg md:text-xl max-w-2xl mb-8 text-[var(--text-secondary)]">
          Every crypto news article comes with a quantified price impact score.
          Get alerts when multiple signals fire together.
        </p>
        <div className="flex gap-4 flex-wrap justify-center">
          <a
            href="dashboard"
            className="px-8 py-3 bg-[var(--accent)] text-white rounded-[var(--radius)] hover:bg-[var(--accent-hover)] transition-colors font-semibold text-lg no-underline"
          >
            {t("nav.dashboard")}
          </a>
          <a
            href="login"
            className="px-8 py-3 border rounded-[var(--radius)] font-semibold text-lg no-underline transition-colors"
            style={{
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          >
            {t("nav.login")}
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-16 max-w-5xl mx-auto w-full">
        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard
            icon="📊"
            title={t("heatmap.title")}
            description={t("heatmap.tip")}
          />
          <FeatureCard
            icon="⚡"
            title={t("alerts.signalRequirements")}
            description={t("alerts.signalRequirementsDesc")}
          />
          <FeatureCard
            icon="🤖"
            title={t("digest.title")}
            description={t("impact.impactTip")}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-16 text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-4 text-[var(--text-primary)]">
          {t("upgrade.title")}
        </h2>
        <p className="text-[var(--text-secondary)] mb-6 max-w-lg mx-auto">
          {t("upgrade.description", { feature: "real-time alerts" })}
        </p>
        <a
          href="billing"
          className="inline-block px-8 py-3 bg-[var(--accent)] text-white rounded-[var(--radius)] hover:bg-[var(--accent-hover)] transition-colors font-semibold no-underline"
        >
          {t("upgrade.cta")}
        </a>
      </section>

      {/* Footer */}
      <footer
        className="px-6 py-8 text-center text-sm border-t"
        style={{
          borderColor: "var(--border)",
          color: "var(--text-muted)",
        }}
      >
        &copy; {new Date().getFullYear()} Wavedge. All rights reserved.
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div
      className="p-6 rounded-[var(--radius)] border transition-colors"
      style={{
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold mb-2 text-[var(--text-primary)]">
        {title}
      </h3>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
        {description}
      </p>
    </div>
  );
}
