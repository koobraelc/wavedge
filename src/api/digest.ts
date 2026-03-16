import { Router } from "express";
import { DigestRepository } from "../db/digest-repository.js";
import { DigestGenerator } from "../services/digest-generator.js";
import { DigestDelivery } from "../services/digest-delivery.js";

export function createDigestRouter(digestRepo?: DigestRepository): Router {
  const router = Router();
  const repo = digestRepo || new DigestRepository();
  const generator = new DigestGenerator();
  const delivery = new DigestDelivery(generator, repo);

  // Subscribe via email
  router.post("/subscribe", (req, res) => {
    const { email, telegram_chat_id, lang } = req.body;
    const validLang = lang === "zh" ? "zh" : "en";

    if (!email && !telegram_chat_id) {
      res.status(400).json({ error: "email or telegram_chat_id required" });
      return;
    }

    try {
      let subscriber;
      if (email) {
        subscriber = repo.subscribeEmail(email, validLang);
      } else {
        subscriber = repo.subscribeTelegram(telegram_chat_id, validLang);
      }
      res.json({ data: subscriber });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // Unsubscribe via token (from email link)
  router.get("/unsubscribe", (req, res) => {
    const token = req.query.token as string;
    if (!token) {
      res.status(400).json({ error: "token required" });
      return;
    }

    const success = repo.unsubscribeByToken(token);
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
  });

  // Unsubscribe via email (API)
  router.post("/unsubscribe", (req, res) => {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: "email required" });
      return;
    }

    const success = repo.unsubscribeEmail(email);
    res.json({ success });
  });

  // Get subscriber stats
  router.get("/subscribers", (_req, res) => {
    const counts = repo.getSubscriberCount();
    res.json({ data: counts });
  });

  // Get digest history
  router.get("/history", (req, res) => {
    const limit = parseInt(req.query.limit as string) || 10;
    const digests = repo.getRecentDigests(limit);
    res.json({ data: digests });
  });

  // Get latest digest for a language
  router.get("/latest", (req, res) => {
    const lang = req.query.lang === "zh" ? "zh" : "en";
    const digest = repo.getLatestDigest(lang);
    if (!digest) {
      res.status(404).json({ error: "No digest found" });
      return;
    }
    res.json({ data: digest });
  });

  // Manually trigger digest generation (for testing/admin)
  router.post("/trigger", async (_req, res) => {
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
