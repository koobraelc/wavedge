import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations();

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4 text-[var(--text-primary)]">
        Wave<span className="text-[var(--accent)]">edge</span>
      </h1>
      <p className="text-lg text-[var(--text-secondary)] mb-8">
        Know everything about crypto.
      </p>
      <a
        href="dashboard"
        className="px-6 py-3 bg-[var(--accent)] text-white rounded-[var(--radius)] hover:bg-[var(--accent-hover)] transition-colors font-semibold"
      >
        {t("nav.dashboard")}
      </a>
    </div>
  );
}
