"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useFetch } from "@/lib/hooks/use-fetch";

interface AlertPrefs {
  enabled: boolean;
  tokenSymbols: string[];
  channels: string[];
  sensitivity: string;
  minSignals: number;
  telegramChatId: string;
  emailAddress: string;
}

interface Token {
  symbol: string;
  name: string;
}

interface AlertRecord {
  tokenSymbol: string;
  signalCount: number;
  summary: string;
  createdAt: string;
  deliveredChannels: string[];
  signals: {
    newsFrequency?: { count: number };
    priceMovement?: { changePercent: number };
    volumeChange?: { changePercent: number };
  };
}

export function AlertsContent({ locale }: { locale: string }) {
  const t = useTranslations("alerts");
  const th = useTranslations("alertHistory");
  const [mode, setMode] = useState<"simple" | "advanced">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("wavedge_alert_mode") as "simple" | "advanced") || "simple";
    }
    return "simple";
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
      <AlertSettingsSection locale={locale} mode={mode} setMode={setMode} t={t} />
      <AlertHistorySection locale={locale} t={th} />
    </div>
  );
}

function AlertSettingsSection({
  locale,
  mode,
  setMode,
  t,
}: {
  locale: string;
  mode: "simple" | "advanced";
  setMode: (m: "simple" | "advanced") => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const { data: prefs, loading: prefsLoading } = useFetch<AlertPrefs>(
    "/api/alerts/preferences?userId=default"
  );
  const { data: tokens } = useFetch<Token[]>("/api/prices");

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [selectedTokens, setSelectedTokens] = useState<string[] | null>(null);
  const [channels, setChannels] = useState<string[] | null>(null);
  const [sensitivity, setSensitivity] = useState<string | null>(null);
  const [minSignals, setMinSignals] = useState<number | null>(null);
  const [telegramChatId, setTelegramChatId] = useState<string | null>(null);
  const [emailAddress, setEmailAddress] = useState<string | null>(null);
  const [tokenSearch, setTokenSearch] = useState("");

  const p = prefs || ({} as Partial<AlertPrefs>);
  const isEnabled = enabled ?? p.enabled ?? true;
  const watchlist = selectedTokens ?? p.tokenSymbols ?? [];
  const activeChannels = channels ?? p.channels ?? ["web"];
  const activeSensitivity = sensitivity ?? p.sensitivity ?? "medium";
  const activeMinSignals = minSignals ?? p.minSignals ?? 2;
  const activeTelegramId = telegramChatId ?? p.telegramChatId ?? "";
  const activeEmail = emailAddress ?? p.emailAddress ?? "";

  const allTokens = (tokens || []).map((tk: Token | { symbol: string; name?: string }) => ({
    symbol: (tk.symbol || "").toUpperCase(),
    name: tk.name || tk.symbol,
  }));

  const filteredTokens = allTokens.filter(
    (tk: { symbol: string; name: string }) =>
      !watchlist.includes(tk.symbol) &&
      (tk.symbol.toLowerCase().includes(tokenSearch.toLowerCase()) ||
        tk.name.toLowerCase().includes(tokenSearch.toLowerCase()))
  );

  const toggleChannel = (ch: string) => {
    const current = [...activeChannels];
    if (current.includes(ch)) {
      setChannels(current.filter((c) => c !== ch));
    } else {
      setChannels([...current, ch]);
    }
  };

  const addToken = (symbol: string) => {
    if (!watchlist.includes(symbol)) {
      setSelectedTokens([...watchlist, symbol]);
    }
    setTokenSearch("");
  };

  const removeToken = (symbol: string) => {
    setSelectedTokens(watchlist.filter((s) => s !== symbol));
  };

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setSaveMsg(null);
      try {
        const body = {
          userId: "default",
          enabled: isEnabled,
          tokenSymbols: watchlist,
          channels: activeChannels,
          sensitivity: activeSensitivity,
          minSignals: activeMinSignals,
          telegramChatId: activeTelegramId,
          emailAddress: activeEmail,
        };
        const res = await fetch("/api/alerts/preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("Failed");
        setSaveMsg(t("saveSuccess"));
      } catch {
        setSaveMsg(t("saveFailed"));
      } finally {
        setSaving(false);
      }
    },
    [isEnabled, watchlist, activeChannels, activeSensitivity, activeMinSignals, activeTelegramId, activeEmail, t]
  );

  const switchMode = (m: "simple" | "advanced") => {
    setMode(m);
    localStorage.setItem("wavedge_alert_mode", m);
  };

  if (prefsLoading) {
    return (
      <div className="text-center py-12 text-[var(--text-muted)]">
        Loading settings...
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => switchMode("simple")}
          className="px-4 py-2 rounded-[var(--radius)] text-sm font-medium transition-colors"
          style={{
            background: mode === "simple" ? "var(--accent)" : "var(--bg-secondary)",
            color: mode === "simple" ? "#fff" : "var(--text-secondary)",
            border: "1px solid var(--border)",
          }}
        >
          {t("modeSimple")}
        </button>
        <button
          type="button"
          onClick={() => switchMode("advanced")}
          className="px-4 py-2 rounded-[var(--radius)] text-sm font-medium transition-colors"
          style={{
            background: mode === "advanced" ? "var(--accent)" : "var(--bg-secondary)",
            color: mode === "advanced" ? "#fff" : "var(--text-secondary)",
            border: "1px solid var(--border)",
          }}
        >
          {t("modeAdvanced")}
        </button>
      </div>

      {/* Alert Status */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>&#9889;</span>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              {t("status")}
            </h3>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 accent-[var(--accent)]"
            />
            <span className="text-sm text-[var(--text-secondary)]">
              {isEnabled ? t("active") : t("paused")}
            </span>
          </label>
        </div>
      </Card>

      {mode === "simple" ? (
        <SimpleAlertBuilder
          t={t}
          watchlist={watchlist}
          allTokens={allTokens}
          filteredTokens={filteredTokens}
          tokenSearch={tokenSearch}
          setTokenSearch={setTokenSearch}
          addToken={addToken}
          removeToken={removeToken}
          sensitivity={activeSensitivity}
          setSensitivity={setSensitivity}
          activeChannels={activeChannels}
          toggleChannel={toggleChannel}
          activeEmail={activeEmail}
          setEmailAddress={setEmailAddress}
        />
      ) : (
        <AdvancedAlertBuilder
          t={t}
          watchlist={watchlist}
          filteredTokens={filteredTokens}
          tokenSearch={tokenSearch}
          setTokenSearch={setTokenSearch}
          addToken={addToken}
          removeToken={removeToken}
          activeChannels={activeChannels}
          toggleChannel={toggleChannel}
          sensitivity={activeSensitivity}
          setSensitivity={setSensitivity}
          minSignals={activeMinSignals}
          setMinSignals={setMinSignals}
          telegramChatId={activeTelegramId}
          setTelegramChatId={setTelegramChatId}
          emailAddress={activeEmail}
          setEmailAddress={setEmailAddress}
        />
      )}

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2 rounded-[var(--radius)] text-sm font-medium transition-colors"
          style={{
            background: "var(--accent)",
            color: "#fff",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "..." : t("save")}
        </button>
        {saveMsg && (
          <span className="text-sm text-[var(--text-secondary)]">{saveMsg}</span>
        )}
      </div>
    </form>
  );
}

function SimpleAlertBuilder({
  t,
  watchlist,
  allTokens,
  filteredTokens,
  tokenSearch,
  setTokenSearch,
  addToken,
  removeToken,
  sensitivity,
  setSensitivity,
  activeChannels,
  toggleChannel,
  activeEmail,
  setEmailAddress,
}: {
  t: ReturnType<typeof useTranslations>;
  watchlist: string[];
  allTokens: { symbol: string; name: string }[];
  filteredTokens: { symbol: string; name: string }[];
  tokenSearch: string;
  setTokenSearch: (v: string) => void;
  addToken: (s: string) => void;
  removeToken: (s: string) => void;
  sensitivity: string;
  setSensitivity: (s: string) => void;
  activeChannels: string[];
  toggleChannel: (ch: string) => void;
  activeEmail: string;
  setEmailAddress: (v: string) => void;
}) {
  const thresholdMap: Record<string, number> = { low: 10, medium: 5, high: 2 };
  const reverseMap: Record<number, string> = { 10: "low", 5: "medium", 2: "high", 20: "low" };
  const currentThreshold = thresholdMap[sensitivity] || 5;

  return (
    <>
      {/* Token picker */}
      <Card>
        <div className="flex items-center gap-2 mb-2">
          <span>&#128276;</span>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {t("simpleSetup")}
          </h3>
        </div>
        <p className="text-sm text-[var(--text-muted)] mb-4">{t("simpleHint")}</p>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-sm text-[var(--text-secondary)]">{t("simpleTellMeWhen")}</span>
          <div className="relative">
            <input
              type="search"
              value={tokenSearch}
              onChange={(e) => setTokenSearch(e.target.value)}
              placeholder={t("simplePickToken")}
              className="px-3 py-1.5 rounded-[var(--radius-sm)] text-sm"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />
            {tokenSearch && filteredTokens.length > 0 && (
              <div
                className="absolute top-full left-0 mt-1 w-48 max-h-48 overflow-y-auto rounded-[var(--radius)] z-10"
                style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
              >
                {filteredTokens.slice(0, 10).map((tk) => (
                  <button
                    key={tk.symbol}
                    type="button"
                    onClick={() => addToken(tk.symbol)}
                    className="w-full text-left px-3 py-2 text-sm hover:opacity-80"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {tk.symbol} - {tk.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="text-sm text-[var(--text-secondary)]">{t("simpleMovesMoreThan")}</span>
          <div className="flex gap-1">
            {[2, 5, 10, 20].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setSensitivity(reverseMap[pct] || "medium")}
                className="px-3 py-1 rounded-[var(--radius-sm)] text-sm font-medium transition-colors"
                style={{
                  background: currentThreshold === pct ? "var(--accent)" : "var(--bg-tertiary)",
                  color: currentThreshold === pct ? "#fff" : "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* Selected tokens */}
        <div>
          <p className="text-sm text-[var(--text-muted)] mb-2">{t("simpleWatching")}</p>
          <div className="flex flex-wrap gap-2">
            {watchlist.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">{t("simpleNoTokens")}</p>
            ) : (
              watchlist.map((s) => (
                <TokenChip key={s} symbol={s} onRemove={() => removeToken(s)} />
              ))
            )}
          </div>
        </div>
      </Card>

      {/* Simple channels */}
      <Card>
        <div className="flex items-center gap-2 mb-2">
          <span>&#128232;</span>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {t("simpleNotifyHow")}
          </h3>
        </div>
        <p className="text-sm text-[var(--text-muted)] mb-3">{t("simpleNotifyHint")}</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked disabled className="w-4 h-4" />
            <span className="text-sm text-[var(--text-primary)]">
              {t("channelWeb")} <span className="text-[var(--text-muted)]">({t("simpleWebAlwaysOn")})</span>
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={activeChannels.includes("email")}
              onChange={() => toggleChannel("email")}
              className="w-4 h-4 accent-[var(--accent)]"
            />
            <span className="text-sm text-[var(--text-primary)]">{t("channelEmail")}</span>
          </label>
          {activeChannels.includes("email") && (
            <input
              type="email"
              value={activeEmail}
              onChange={(e) => setEmailAddress(e.target.value)}
              placeholder={t("emailPlaceholder")}
              className="ml-6 px-3 py-1.5 rounded-[var(--radius-sm)] text-sm w-64"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />
          )}
        </div>
      </Card>
    </>
  );
}

function AdvancedAlertBuilder({
  t,
  watchlist,
  filteredTokens,
  tokenSearch,
  setTokenSearch,
  addToken,
  removeToken,
  activeChannels,
  toggleChannel,
  sensitivity,
  setSensitivity,
  minSignals,
  setMinSignals,
  telegramChatId,
  setTelegramChatId,
  emailAddress,
  setEmailAddress,
}: {
  t: ReturnType<typeof useTranslations>;
  watchlist: string[];
  filteredTokens: { symbol: string; name: string }[];
  tokenSearch: string;
  setTokenSearch: (v: string) => void;
  addToken: (s: string) => void;
  removeToken: (s: string) => void;
  activeChannels: string[];
  toggleChannel: (ch: string) => void;
  sensitivity: string;
  setSensitivity: (s: string) => void;
  minSignals: number;
  setMinSignals: (n: number) => void;
  telegramChatId: string;
  setTelegramChatId: (v: string) => void;
  emailAddress: string;
  setEmailAddress: (v: string) => void;
}) {
  return (
    <>
      {/* Token Watchlist */}
      <Card>
        <div className="flex items-center gap-2 mb-2">
          <span>&#9733;</span>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {t("watchlist")}
          </h3>
        </div>
        <p className="text-sm text-[var(--text-muted)] mb-3">{t("watchlistDesc")}</p>
        <div className="relative mb-3">
          <input
            type="search"
            value={tokenSearch}
            onChange={(e) => setTokenSearch(e.target.value)}
            placeholder={t("searchTokens")}
            className="w-full px-3 py-2 rounded-[var(--radius-sm)] text-sm"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
            }}
          />
          {tokenSearch && filteredTokens.length > 0 && (
            <div
              className="absolute top-full left-0 mt-1 w-full max-h-48 overflow-y-auto rounded-[var(--radius)] z-10"
              style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
            >
              {filteredTokens.slice(0, 15).map((tk) => (
                <button
                  key={tk.symbol}
                  type="button"
                  onClick={() => addToken(tk.symbol)}
                  className="w-full text-left px-3 py-2 text-sm hover:opacity-80"
                  style={{ color: "var(--text-primary)" }}
                >
                  {tk.symbol} - {tk.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {watchlist.map((s) => (
            <TokenChip key={s} symbol={s} onRemove={() => removeToken(s)} />
          ))}
        </div>
      </Card>

      {/* Channels */}
      <Card>
        <div className="flex items-center gap-2 mb-2">
          <span>&#128276;</span>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {t("channels")}
          </h3>
        </div>
        <p className="text-sm text-[var(--text-muted)] mb-3">{t("channelsDesc")}</p>
        <div className="space-y-3">
          {[
            { value: "web", label: t("channelWeb"), desc: t("channelWebDesc") },
            { value: "telegram", label: t("channelTelegram"), desc: t("channelTelegramDesc") },
            { value: "email", label: t("channelEmail"), desc: t("channelEmailDesc") },
            { value: "push", label: t("channelPush"), desc: t("channelPushDesc") },
          ].map((ch) => (
            <div key={ch.value}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeChannels.includes(ch.value)}
                  onChange={() => toggleChannel(ch.value)}
                  className="mt-0.5 w-4 h-4 accent-[var(--accent)]"
                />
                <div>
                  <div className="text-sm font-medium text-[var(--text-primary)]">{ch.label}</div>
                  <div className="text-xs text-[var(--text-muted)]">{ch.desc}</div>
                </div>
              </label>
              {ch.value === "telegram" && activeChannels.includes("telegram") && (
                <div className="ml-7 mt-2">
                  <label className="text-xs text-[var(--text-muted)] block mb-1">
                    {t("telegramChatId")}
                  </label>
                  <input
                    type="text"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    placeholder={t("telegramPlaceholder")}
                    className="px-3 py-1.5 rounded-[var(--radius-sm)] text-sm w-48"
                    style={{
                      background: "var(--bg-tertiary)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                    }}
                  />
                  <p className="text-xs text-[var(--text-muted)] mt-1">{t("telegramHelp")}</p>
                </div>
              )}
              {ch.value === "email" && activeChannels.includes("email") && (
                <div className="ml-7 mt-2">
                  <label className="text-xs text-[var(--text-muted)] block mb-1">
                    {t("emailAddress")}
                  </label>
                  <input
                    type="email"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    placeholder={t("emailPlaceholder")}
                    className="px-3 py-1.5 rounded-[var(--radius-sm)] text-sm w-64"
                    style={{
                      background: "var(--bg-tertiary)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Sensitivity */}
      <Card>
        <div className="flex items-center gap-2 mb-2">
          <span>&#9881;</span>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {t("sensitivity")}
          </h3>
        </div>
        <p className="text-sm text-[var(--text-muted)] mb-3">{t("sensitivityDesc")}</p>
        <div className="grid grid-cols-3 gap-3">
          {(["low", "medium", "high"] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setSensitivity(level)}
              className="p-3 rounded-[var(--radius)] text-center transition-colors"
              style={{
                background: sensitivity === level ? "var(--accent)" : "var(--bg-tertiary)",
                color: sensitivity === level ? "#fff" : "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="text-sm font-medium">{t(`sensitivity${level.charAt(0).toUpperCase() + level.slice(1)}` as "sensitivityLow")}</div>
              <div className="text-xs mt-1 opacity-80">
                {t(`sensitivity${level.charAt(0).toUpperCase() + level.slice(1)}Desc` as "sensitivityLowDesc")}
              </div>
              {level === "medium" && (
                <div className="text-xs mt-1 font-medium" style={{ color: sensitivity === level ? "#fff" : "var(--accent)" }}>
                  {t("recommended")}
                </div>
              )}
            </button>
          ))}
        </div>
      </Card>

      {/* Signal Requirements */}
      <Card>
        <div className="flex items-center gap-2 mb-2">
          <span>&#128200;</span>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            {t("signalRequirements")}
          </h3>
        </div>
        <p className="text-sm text-[var(--text-muted)] mb-3">{t("signalRequirementsDesc")}</p>
        <div className="space-y-2">
          {[
            { value: 1, label: t("signalAny") },
            { value: 2, label: t("signalTwo") },
            { value: 3, label: t("signalThree") },
            { value: 4, label: t("signalFour") },
            { value: 5, label: t("signalAll") },
          ].map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="minSignals"
                checked={minSignals === opt.value}
                onChange={() => setMinSignals(opt.value)}
                className="w-4 h-4 accent-[var(--accent)]"
              />
              <span className="text-sm text-[var(--text-primary)]">{opt.label}</span>
            </label>
          ))}
        </div>
      </Card>
    </>
  );
}

function AlertHistorySection({
  locale,
  t,
}: {
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const [hours, setHours] = useState(24);
  const { data: alerts, loading, error } = useFetch<AlertRecord[]>(
    `/api/alerts/history?userId=default&hours=${hours}`,
    { refreshInterval: 60000 }
  );

  if (loading) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        {t("loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-[var(--red)]">{t("failed")}</div>
    );
  }

  const items = alerts || [];

  return (
    <div>
      {/* Range buttons */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {[24, 48, 72, 168].map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHours(h)}
              className="px-3 py-1 rounded-[var(--radius-sm)] text-sm transition-colors"
              style={{
                background: hours === h ? "var(--accent)" : "var(--bg-secondary)",
                color: hours === h ? "#fff" : "var(--text-secondary)",
                border: "1px solid var(--border)",
              }}
            >
              {h <= 48 ? `${h}h` : `${Math.round(h / 24)}d`}
            </button>
          ))}
        </div>
        {items.length > 0 && (
          <span className="text-sm text-[var(--text-muted)]">
            {items.length} {items.length === 1 ? t("alert") : t("alerts")}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <Card>
          <p className="text-center text-[var(--text-muted)]">
            {t("noAlerts", { hours })}
          </p>
          <p className="text-center text-sm text-[var(--text-muted)] mt-1">
            {t("explanation")}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((alert, i) => (
            <AlertCard key={i} alert={alert} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function AlertCard({
  alert,
  t,
}: {
  alert: AlertRecord;
  t: ReturnType<typeof useTranslations>;
}) {
  const signals = alert.signals || {};
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className="px-2 py-0.5 rounded text-xs font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {alert.tokenSymbol}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {alert.signalCount} signal{alert.signalCount !== 1 ? "s" : ""}
          </span>
          {signals.priceMovement && (
            <span
              className="text-xs font-medium"
              style={{
                color: signals.priceMovement.changePercent >= 0 ? "var(--green)" : "var(--red)",
              }}
            >
              {signals.priceMovement.changePercent >= 0 ? "+" : ""}
              {signals.priceMovement.changePercent.toFixed(2)}%
            </span>
          )}
        </div>
        <span className="text-xs text-[var(--text-muted)]">
          {formatTime(alert.createdAt)}
        </span>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-2">{alert.summary}</p>
      <div className="flex flex-wrap gap-2">
        {signals.newsFrequency && (
          <span
            className="px-2 py-0.5 rounded text-xs"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          >
            {t("newsSignal", { count: signals.newsFrequency.count })}
          </span>
        )}
        {signals.priceMovement && (
          <span
            className="px-2 py-0.5 rounded text-xs"
            style={{
              background: "var(--bg-tertiary)",
              color: signals.priceMovement.changePercent >= 0 ? "var(--green)" : "var(--red)",
            }}
          >
            {t("priceSignal", {
              sign: signals.priceMovement.changePercent >= 0 ? "+" : "",
              pct: Math.abs(signals.priceMovement.changePercent).toFixed(2),
            })}
          </span>
        )}
        {signals.volumeChange && (
          <span
            className="px-2 py-0.5 rounded text-xs"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
          >
            {t("volumeSignal", { pct: signals.volumeChange.changePercent.toFixed(0) })}
          </span>
        )}
      </div>
    </Card>
  );
}

function TokenChip({ symbol, onRemove }: { symbol: string; onRemove: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--radius-sm)] text-sm"
      style={{
        background: "var(--bg-tertiary)",
        color: "var(--text-primary)",
        border: "1px solid var(--border)",
      }}
    >
      {symbol}
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 text-[var(--text-muted)] hover:text-[var(--red)] transition-colors"
        aria-label={`Remove ${symbol}`}
      >
        &times;
      </button>
    </span>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="p-4 rounded-[var(--radius)]"
      style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
      }}
    >
      {children}
    </div>
  );
}

function formatTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
