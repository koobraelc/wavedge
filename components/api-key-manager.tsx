"use client";

import { useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useFetch } from "@/lib/hooks/use-fetch";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface ApiUsage {
  usage_today: number;
  daily_limit: number;
  active_keys: number;
  max_keys: number;
}

export function ApiKeyManager() {
  const t = useTranslations("apiKey");
  const token = typeof window !== "undefined" ? localStorage.getItem("wavedge_token") : null;

  if (!token) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        {t("loginRequired")}
      </p>
    );
  }

  return <ApiKeyManagerInner token={token} />;
}

function ApiKeyManagerInner({ token }: { token: string }) {
  const t = useTranslations("apiKey");
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const { data: keysData, loading: keysLoading, error: keysError, refetch: refetchKeys } = useFetch<{ keys: ApiKey[] }>(
    "/api/api-keys"
  );
  const { data: usage } = useFetch<ApiUsage>("/api/api-keys/usage");

  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const keys = keysData?.keys || [];
  const activeKeys = keys.filter((k) => !k.revoked_at);
  const revokedKeys = keys.filter((k) => k.revoked_at);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newKeyName.trim()) return;
      setGenerating(true);
      try {
        const res = await fetch("/api/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ name: newKeyName.trim() }),
        });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setNewKeyValue(data.key);
        setNewKeyName("");
        refetchKeys();
      } catch {
        // silent
      } finally {
        setGenerating(false);
      }
    },
    [newKeyName, authHeaders, refetchKeys]
  );

  const handleRevoke = useCallback(
    async (id: string) => {
      if (!confirm(t("revokeConfirm"))) return;
      try {
        await fetch(`/api/api-keys/${id}`, {
          method: "DELETE",
          headers: authHeaders,
        });
        refetchKeys();
      } catch {
        // silent
      }
    },
    [authHeaders, refetchKeys, t]
  );

  const handleCopy = () => {
    if (newKeyValue) {
      navigator.clipboard.writeText(newKeyValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (keysLoading) {
    return <p className="text-sm text-[var(--text-muted)]">{t("loading")}</p>;
  }

  if (keysError) {
    // Likely 403 = not pro
    return (
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)] mb-1">{t("proOnly")}</p>
        <p className="text-sm text-[var(--text-muted)] mb-3">{t("proDesc")}</p>
        <a
          href="billing"
          className="inline-block px-4 py-2 rounded-[var(--radius)] text-sm font-medium"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {t("upgradePro")}
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Usage bar */}
      {usage && (
        <div>
          <div className="flex justify-between text-xs text-[var(--text-muted)] mb-1">
            <span>{t("usageToday")}</span>
            <span>{t("usageCount", { usage: usage.usage_today, limit: usage.daily_limit })}</span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: "var(--bg-tertiary)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, (usage.usage_today / usage.daily_limit) * 100)}%`,
                background: "var(--accent)",
              }}
            />
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1">
            {t("activeKeys", { active: usage.active_keys, max: usage.max_keys })}
          </div>
        </div>
      )}

      {/* Create key */}
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          placeholder={t("keyNamePlaceholder")}
          maxLength={50}
          className="flex-1 px-3 py-1.5 rounded-[var(--radius-sm)] text-sm"
          style={{
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
          }}
        />
        <button
          type="submit"
          disabled={generating}
          className="px-4 py-1.5 rounded-[var(--radius-sm)] text-sm font-medium"
          style={{
            background: "var(--accent)",
            color: "#fff",
            opacity: generating ? 0.6 : 1,
          }}
        >
          {generating ? t("generating") : t("generate")}
        </button>
      </form>

      {/* New key display */}
      {newKeyValue && (
        <div
          className="p-3 rounded-[var(--radius)]"
          style={{ background: "var(--bg-tertiary)", border: "1px solid var(--yellow)" }}
        >
          <p className="text-xs text-[var(--yellow)] mb-2">{t("copyWarning")}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-[var(--text-primary)] break-all font-mono">
              {newKeyValue}
            </code>
            <button
              onClick={handleCopy}
              className="px-3 py-1 rounded-[var(--radius-sm)] text-xs font-medium"
              style={{
                background: "var(--bg-secondary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            >
              {copied ? t("copied") : t("copy")}
            </button>
          </div>
        </div>
      )}

      {/* Active keys */}
      <div>
        <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">
          {t("activeKeysTitle")}
        </h4>
        {activeKeys.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t("noKeys")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="text-left px-2 py-1 text-[var(--text-muted)]">{t("headerName")}</th>
                  <th className="text-left px-2 py-1 text-[var(--text-muted)]">{t("headerKey")}</th>
                  <th className="text-left px-2 py-1 text-[var(--text-muted)]">{t("headerCreated")}</th>
                  <th className="text-left px-2 py-1 text-[var(--text-muted)]">{t("headerLastUsed")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {activeKeys.map((k) => (
                  <tr key={k.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-2 py-1.5 text-[var(--text-primary)]">{k.name}</td>
                    <td className="px-2 py-1.5 text-[var(--text-muted)] font-mono">{k.key_prefix}...</td>
                    <td className="px-2 py-1.5 text-[var(--text-muted)]">
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-2 py-1.5 text-[var(--text-muted)]">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : t("never")}
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        onClick={() => handleRevoke(k.id)}
                        className="text-[var(--red)] hover:underline text-xs"
                      >
                        {t("revoke")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Revoked keys */}
      {revokedKeys.length > 0 && (
        <details>
          <summary className="text-sm text-[var(--text-muted)] cursor-pointer">
            {t("revokedKeys", { count: revokedKeys.length })}
          </summary>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs opacity-60">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th className="text-left px-2 py-1 text-[var(--text-muted)]">{t("headerName")}</th>
                  <th className="text-left px-2 py-1 text-[var(--text-muted)]">{t("headerKey")}</th>
                  <th className="text-left px-2 py-1 text-[var(--text-muted)]">{t("headerRevoked")}</th>
                </tr>
              </thead>
              <tbody>
                {revokedKeys.map((k) => (
                  <tr key={k.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-2 py-1.5 text-[var(--text-primary)]">{k.name}</td>
                    <td className="px-2 py-1.5 text-[var(--text-muted)] font-mono">{k.key_prefix}...</td>
                    <td className="px-2 py-1.5 text-[var(--text-muted)]">
                      {k.revoked_at ? new Date(k.revoked_at).toLocaleDateString() : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
