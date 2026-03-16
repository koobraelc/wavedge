import webpush from "web-push";
import { PushRepository } from "../db/push-repository.js";
import type { Signal } from "./signal-detectors.js";

export interface AlertPayload {
  tokenSymbol: string;
  signals: Signal[];
  summary: string;
}

export interface NotificationChannel {
  name: string;
  send(payload: AlertPayload, config: Record<string, string>): Promise<boolean>;
}

/**
 * Telegram bot notification channel.
 * Requires TELEGRAM_BOT_TOKEN env var and a chat_id per user.
 */
export const telegramChannel: NotificationChannel = {
  name: "telegram",
  async send(payload: AlertPayload, config: Record<string, string>): Promise<boolean> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = config.telegram_chat_id;

    if (!botToken || !chatId) {
      console.warn("Telegram: missing bot token or chat_id, skipping");
      return false;
    }

    const text = formatTelegramMessage(payload);
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
          disable_web_page_preview: true,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        console.error(`Telegram send failed: ${res.status} ${body}`);
        return false;
      }
      return true;
    } catch (err) {
      console.error("Telegram send error:", err);
      return false;
    }
  },
};

function formatTelegramMessage(payload: AlertPayload): string {
  const lines = [
    `🚨 *${payload.tokenSymbol.toUpperCase()} Multi-Signal Alert*`,
    "",
    payload.summary,
    "",
    "*Signals:*",
  ];
  for (const signal of payload.signals) {
    const emoji = signal.type === "news_frequency" ? "📰" : signal.type === "price_movement" ? "📈" : "📊";
    lines.push(`${emoji} ${signal.detail}`);
  }
  lines.push("", `_${new Date().toISOString()}_`);
  return lines.join("\n");
}

/**
 * Email notification channel via Resend API.
 * Requires RESEND_API_KEY env var and RESEND_FROM_EMAIL.
 */
export const emailChannel: NotificationChannel = {
  name: "email",
  async send(payload: AlertPayload, config: Record<string, string>): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "alerts@wavedge.io";
    const toEmail = config.email_address;

    if (!apiKey || !toEmail) {
      console.warn("Email: missing API key or recipient, skipping");
      return false;
    }

    const html = formatEmailHtml(payload);

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [toEmail],
          subject: `🚨 ${payload.tokenSymbol.toUpperCase()} Alert: ${payload.signals.length} signals detected`,
          html,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        console.error(`Resend send failed: ${res.status} ${body}`);
        return false;
      }
      return true;
    } catch (err) {
      console.error("Email send error:", err);
      return false;
    }
  },
};

function formatEmailHtml(payload: AlertPayload): string {
  const signalRows = payload.signals
    .map((s) => {
      const emoji = s.type === "news_frequency" ? "📰" : s.type === "price_movement" ? "📈" : "📊";
      return `<tr><td style="padding:8px;border-bottom:1px solid #eee">${emoji} ${escapeHtml(s.detail)}</td></tr>`;
    })
    .join("");

  return `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#ef4444">🚨 ${escapeHtml(payload.tokenSymbol.toUpperCase())} Multi-Signal Alert</h2>
      <p style="font-size:16px;color:#374151">${escapeHtml(payload.summary)}</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <thead><tr><th style="text-align:left;padding:8px;border-bottom:2px solid #e5e7eb;color:#6b7280">Signals Detected</th></tr></thead>
        <tbody>${signalRows}</tbody>
      </table>
      <p style="font-size:12px;color:#9ca3af">${new Date().toISOString()} — Wavedge Alert Engine</p>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Web Push notification channel.
 * Requires VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars.
 * Sends push notifications to all subscriptions for the user.
 */
export const webPushChannel: NotificationChannel = {
  name: "push",
  async send(payload: AlertPayload, config: Record<string, string>): Promise<boolean> {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const userId = config.user_id;

    if (!publicKey || !privateKey) {
      console.warn("Web Push: missing VAPID keys, skipping");
      return false;
    }

    if (!userId) {
      console.warn("Web Push: missing user_id in config, skipping");
      return false;
    }

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:alerts@wavedge.io",
      publicKey,
      privateKey
    );

    const pushRepo = new PushRepository();
    const subscriptions = pushRepo.getByUser(userId);

    if (subscriptions.length === 0) {
      console.warn(`Web Push: no subscriptions for user ${userId}, skipping`);
      return false;
    }

    const notificationPayload = JSON.stringify({
      title: `${payload.tokenSymbol.toUpperCase()} Alert`,
      body: payload.summary,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      data: {
        url: "/dashboard",
        tokenSymbol: payload.tokenSymbol,
        signals: payload.signals.map((s) => s.type),
      },
    });

    let anySent = false;
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          notificationPayload
        );
        anySent = true;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          // Subscription expired or invalid — clean up
          pushRepo.removeByEndpoint(sub.endpoint);
          console.log(`Web Push: removed expired subscription ${sub.endpoint}`);
        } else {
          console.error(`Web Push send error for ${sub.endpoint}:`, err);
        }
      }
    }

    return anySent;
  },
};

/** Registry of all available channels */
export const channelRegistry: Record<string, NotificationChannel> = {
  telegram: telegramChannel,
  email: emailChannel,
  push: webPushChannel,
};
