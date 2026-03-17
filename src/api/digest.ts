import { Router } from "express";
import { DigestRepository } from "../db/digest-repository.js";
import { DigestGenerator } from "../services/digest-generator.js";
import { DigestDelivery } from "../services/digest-delivery.js";
import { requireAuth, type AuthenticatedRequest } from "../services/auth.js";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

function requireAdmin(req: AuthenticatedRequest, res: import("express").Response, next: import("express").NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (ADMIN_EMAILS.length > 0 && !ADMIN_EMAILS.includes(req.user.email.toLowerCase())) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

export function createDigestRouter(digestRepo?: DigestRepository): Router {
  const router = Router();
  const repo = digestRepo || new DigestRepository();
  const generator = new DigestGenerator();
  const delivery = new DigestDelivery(generator, repo);

  // Subscribe via email
  router.post("/subscribe", async (req, res) => {
    const { email, telegram_chat_id, lang } = req.body;
    const validLang = lang === "zh" ? "zh" : "en";

    if (!email && !telegram_chat_id) {
      res.status(400).json({ error: "email or telegram_chat_id required" });
      return;
    }

    try {
      let subscriber;
      if (email) {
        subscriber = await repo.subscribeEmail(email, validLang);
      } else {
        subscriber = await repo.subscribeTelegram(telegram_chat_id, validLang);
      }
      res.json({ data: subscriber });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // Unsubscribe via token (from email link)
  router.get("/unsubscribe", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) {
        res.status(400).json({ error: "token required" });
        return;
      }

      const success = await repo.unsubscribeByToken(token);
      if (success) {
        res.type("html").send(`
          <html><body style="font-family:system-ui;text-align:center;padding:60px">
            <h2>Unsubscribed</h2>
            <p>You have been removed from the Wavedge daily digest.</p>
          </body></html>
        `);
      } else {
        res.status(404).json({ error: "Invalid or expired unsubscribe token" });
      }
    } catch (err) {
      console.error("[Digest] Unsubscribe error:", err);
      res.status(500).json({ error: "Failed to unsubscribe" });
    }
  });

  // Unsubscribe via email (API)
  router.post("/unsubscribe", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        res.status(400).json({ error: "email required" });
        return;
      }

      const success = await repo.unsubscribeEmail(email);
      res.json({ success });
    } catch (err) {
      console.error("[Digest] Unsubscribe email error:", err);
      res.status(500).json({ error: "Failed to unsubscribe" });
    }
  });

  // Get subscriber stats
  router.get("/subscribers", async (_req, res) => {
    try {
      const counts = await repo.getSubscriberCount();
      res.json({ data: counts });
    } catch (err) {
      console.error("[Digest] Subscribers error:", err);
      res.status(500).json({ error: "Failed to fetch subscriber count" });
    }
  });

  // Get digest history
  router.get("/history", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const digests = await repo.getRecentDigests(limit);
      res.json({ data: digests });
    } catch (err) {
      console.error("[Digest] History error:", err);
      res.status(500).json({ error: "Failed to fetch digest history" });
    }
  });

  // Get latest digest for a language
  router.get("/latest", async (req, res) => {
    try {
      const lang = req.query.lang === "zh" ? "zh" : "en";
      const digest = await repo.getLatestDigest(lang);
      if (!digest) {
        res.status(404).json({ error: "No digest found" });
        return;
      }
      res.json({ data: digest });
    } catch (err) {
      console.error("[Digest] Latest error:", err);
      res.status(500).json({ error: "Failed to fetch latest digest" });
    }
  });

  // Manually trigger digest generation (admin-only)
  router.post("/trigger", requireAuth as any, requireAdmin as any, async (_req, res) => {
    try {
      const results = await delivery.runDaily();
      res.json({ data: results });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  return router;
}
