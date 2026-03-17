import { DigestGenerator, type DigestContent } from "./digest-generator.js";
import { DigestRepository, type DigestSubscriberRow } from "../db/digest-repository.js";

export interface DigestDeliveryResult {
  lang: string;
  emailsSent: number;
  telegramsSent: number;
  errors: string[];
}

/**
 * Orchestrates daily digest generation and delivery to all subscribers.
 * Generates both EN and ZH digests, then delivers via email and Telegram.
 */
export class DigestDelivery {
  constructor(
    private generator: DigestGenerator,
    private repo: DigestRepository
  ) {}

  /** Run the full daily digest pipeline for both languages */
  async runDaily(): Promise<DigestDeliveryResult[]> {
    const results: DigestDeliveryResult[] = [];

    for (const lang of ["en", "zh"] as const) {
      const subscribers = await this.repo.getActiveSubscribers(lang);
      if (subscribers.length === 0) {
        console.log(`Digest: no active ${lang} subscribers, skipping`);
        continue;
      }

      try {
        const digest = await this.generator.generate(lang);
        const result = await this.deliver(digest, subscribers);
        results.push(result);

        await this.repo.saveDigest({
          lang,
          subject: digest.subject,
          contentHtml: digest.bodyHtml,
          contentTelegram: digest.bodyTelegram,
          emailsSent: result.emailsSent,
          telegramsSent: result.telegramsSent,
        });

        console.log(`Digest ${lang}: ${result.emailsSent} emails, ${result.telegramsSent} telegrams sent`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Digest ${lang} generation failed:`, msg);
        results.push({ lang, emailsSent: 0, telegramsSent: 0, errors: [msg] });
      }
    }

    return results;
  }

  /** Generate and deliver for a specific language */
  async runForLang(lang: "en" | "zh"): Promise<DigestDeliveryResult> {
    const subscribers = await this.repo.getActiveSubscribers(lang);
    const digest = await this.generator.generate(lang);
    const result = await this.deliver(digest, subscribers);

    await this.repo.saveDigest({
      lang,
      subject: digest.subject,
      contentHtml: digest.bodyHtml,
      contentTelegram: digest.bodyTelegram,
      emailsSent: result.emailsSent,
      telegramsSent: result.telegramsSent,
    });

    return result;
  }

  private async deliver(
    digest: DigestContent,
    subscribers: DigestSubscriberRow[]
  ): Promise<DigestDeliveryResult> {
    const result: DigestDeliveryResult = {
      lang: digest.lang,
      emailsSent: 0,
      telegramsSent: 0,
      errors: [],
    };

    const emailSubs = subscribers.filter((s) => s.email);
    const telegramSubs = subscribers.filter((s) => s.telegram_chat_id);

    // Send emails
    for (const sub of emailSubs) {
      try {
        const html = digest.bodyHtml.replace("{{{unsubscribe_url}}}", `/api/digest/unsubscribe?token=${sub.unsubscribe_token}`);
        const ok = await this.sendEmail(sub.email!, digest.subject, html);
        if (ok) result.emailsSent++;
      } catch (err) {
        result.errors.push(`email ${sub.email}: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Send Telegram messages
    for (const sub of telegramSubs) {
      try {
        const ok = await this.sendTelegram(sub.telegram_chat_id!, digest.bodyTelegram);
        if (ok) result.telegramsSent++;
      } catch (err) {
        result.errors.push(`telegram ${sub.telegram_chat_id}: ${err instanceof Error ? err.message : err}`);
      }
    }

    return result;
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "digest@wavedge.io";

    if (!apiKey) {
      console.warn("Digest email: RESEND_API_KEY not set, skipping");
      return false;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from: fromEmail, to: [to], subject, html }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Digest email failed for ${to}: ${res.status} ${body}`);
      return false;
    }
    return true;
  }

  private async sendTelegram(chatId: string, text: string): Promise<boolean> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.warn("Digest telegram: TELEGRAM_BOT_TOKEN not set, skipping");
      return false;
    }

    // Telegram has a 4096 char limit; truncate if needed
    const truncated = text.length > 4000
      ? text.slice(0, 3997) + "..."
      : text;

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: truncated,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Digest telegram failed for ${chatId}: ${res.status} ${body}`);
      return false;
    }
    return true;
  }
}
