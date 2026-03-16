import { Router, type Request, type Response } from "express";
import { AlertRepository } from "../db/alert-repository.js";
import { PushRepository } from "../db/push-repository.js";
import { UserRepository } from "../db/user-repository.js";
import { TIER_LIMITS } from "../services/tier-limiter.js";

const VALID_SENSITIVITIES = ["low", "medium", "high"];
const VALID_CHANNELS = ["telegram", "email", "web", "push"];

export function createAlertsRouter(repo?: AlertRepository, pushRepo?: PushRepository): Router {
  const router = Router();
  const alertRepo = repo || new AlertRepository();
  const pushRepository = pushRepo || new PushRepository();

  // GET /api/alerts/preferences
  router.get("/preferences", (req: Request, res: Response) => {
    const userId = (req.query.userId as string) || "default";
    const prefs = alertRepo.getPreferences(userId);

    if (!prefs) {
      res.json({ data: null });
      return;
    }

    res.json({
      data: formatPreferences(prefs),
    });
  });

  // POST /api/alerts/preferences — create preferences
  router.post("/preferences", (req: Request, res: Response) => {
    const body = req.body;
    const validation = validatePreferencesBody(body);
    if (validation) {
      res.status(400).json({ error: validation });
      return;
    }

    const prefs = alertRepo.upsertPreferences({
      userId: body.userId || "default",
      tokenSymbols: body.tokenSymbols,
      channels: body.channels,
      sensitivity: body.sensitivity,
      newsFrequencyThreshold: body.newsFrequencyThreshold,
      newsWindowMinutes: body.newsWindowMinutes,
      priceChangeThreshold: body.priceChangeThreshold,
      volumeChangeThreshold: body.volumeChangeThreshold,
      sentimentChangeThreshold: body.sentimentChangeThreshold,
      minSignals: body.minSignals,
      enabled: body.enabled,
      telegramChatId: body.telegramChatId,
      emailAddress: body.emailAddress,
    });

    res.status(201).json({ data: formatPreferences(prefs) });
  });

  // PATCH /api/alerts/preferences — update preferences
  router.patch("/preferences", (req: Request, res: Response) => {
    const body = req.body;
    const userId = body.userId || "default";

    const existing = alertRepo.getPreferences(userId);
    if (!existing) {
      res.status(404).json({ error: "No preferences found. Use POST to create." });
      return;
    }

    const validation = validatePreferencesBody(body, true);
    if (validation) {
      res.status(400).json({ error: validation });
      return;
    }

    const prefs = alertRepo.upsertPreferences({
      userId,
      tokenSymbols: body.tokenSymbols,
      channels: body.channels,
      sensitivity: body.sensitivity,
      newsFrequencyThreshold: body.newsFrequencyThreshold,
      newsWindowMinutes: body.newsWindowMinutes,
      priceChangeThreshold: body.priceChangeThreshold,
      volumeChangeThreshold: body.volumeChangeThreshold,
      sentimentChangeThreshold: body.sentimentChangeThreshold,
      minSignals: body.minSignals,
      enabled: body.enabled,
      telegramChatId: body.telegramChatId,
      emailAddress: body.emailAddress,
    });

    res.json({ data: formatPreferences(prefs) });
  });

  // GET /api/alerts/history — get triggered alerts
  router.get("/history", (req: Request, res: Response) => {
    const userId = (req.query.userId as string) || "default";
    const hours = Math.min(Number(req.query.hours) || 24, 168); // max 7 days

    const alerts = alertRepo.getRecentAlerts(userId, hours);
    res.json({
      data: alerts.map((a) => ({
        id: a.id,
        tokenSymbol: a.token_symbol,
        signals: JSON.parse(a.signals),
        signalCount: a.signal_count,
        summary: a.summary,
        deliveredChannels: JSON.parse(a.delivered_channels),
        createdAt: a.created_at,
      })),
      count: alerts.length,
    });
  });

  // GET /api/alerts/missed — get missed alerts summary for free tier users
  router.get("/missed", (req: Request, res: Response) => {
    const userId = (req.query.userId as string) || "default";

    const userRepo = new UserRepository();
    const user = userRepo.findById(userId);
    const tier = user?.tier ?? "free";

    if (tier === "pro") {
      res.json({
        data: { missedToday: 0, alerts: [], tier: "pro", dailyLimit: null },
      });
      return;
    }

    const missedToday = alertRepo.getDailyMissedAlertCount(userId);
    const missedAlerts = alertRepo.getRecentMissedAlerts(userId, 24);
    const deliveredToday = userRepo.getDailyAlertCount(userId);

    res.json({
      data: {
        missedToday,
        deliveredToday,
        dailyLimit: TIER_LIMITS.free.alertsPerDay,
        tier,
        alerts: missedAlerts.map((a) => ({
          id: a.id,
          tokenSymbol: a.token_symbol,
          signals: JSON.parse(a.signals),
          signalCount: a.signal_count,
          summary: a.summary,
          createdAt: a.created_at,
        })),
      },
    });
  });

  // GET /api/alerts/push/vapid-public-key — get VAPID public key for client-side subscription
  router.get("/push/vapid-public-key", (_req: Request, res: Response) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
      res.status(503).json({ error: "Web push not configured" });
      return;
    }
    res.json({ data: { publicKey } });
  });

  // POST /api/alerts/push/subscribe — save a push subscription
  router.post("/push/subscribe", (req: Request, res: Response) => {
    const { userId, subscription } = req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      res.status(400).json({ error: "Invalid push subscription object" });
      return;
    }

    pushRepository.upsert(
      userId || "default",
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth
    );

    res.status(201).json({ data: { subscribed: true } });
  });

  // POST /api/alerts/push/unsubscribe — remove a push subscription
  router.post("/push/unsubscribe", (req: Request, res: Response) => {
    const { endpoint } = req.body;
    if (!endpoint) {
      res.status(400).json({ error: "endpoint is required" });
      return;
    }

    pushRepository.removeByEndpoint(endpoint);

    res.json({ data: { unsubscribed: true } });
  });

  // GET /api/alerts/push/status — check if user has push subscriptions
  router.get("/push/status", (req: Request, res: Response) => {
    const userId = (req.query.userId as string) || "default";
    const hasSubscription = pushRepository.hasSubscription(userId);
    res.json({ data: { subscribed: hasSubscription } });
  });

  return router;
}

function formatPreferences(row: NonNullable<ReturnType<AlertRepository["getPreferences"]>>) {
  return {
    userId: row.user_id,
    tokenSymbols: JSON.parse(row.token_symbols),
    channels: JSON.parse(row.channels),
    sensitivity: row.sensitivity,
    newsFrequencyThreshold: row.news_frequency_threshold,
    newsWindowMinutes: row.news_window_minutes,
    priceChangeThreshold: row.price_change_threshold,
    volumeChangeThreshold: row.volume_change_threshold,
    sentimentChangeThreshold: row.sentiment_change_threshold,
    minSignals: row.min_signals,
    enabled: row.enabled === 1,
    telegramChatId: row.telegram_chat_id,
    emailAddress: row.email_address,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validatePreferencesBody(body: Record<string, unknown>, partial: boolean = false): string | null {
  if (body.sensitivity && !VALID_SENSITIVITIES.includes(body.sensitivity as string)) {
    return `Invalid sensitivity. Must be one of: ${VALID_SENSITIVITIES.join(", ")}`;
  }
  if (body.channels) {
    if (!Array.isArray(body.channels)) return "channels must be an array";
    for (const ch of body.channels) {
      if (!VALID_CHANNELS.includes(ch as string)) {
        return `Invalid channel "${ch}". Must be one of: ${VALID_CHANNELS.join(", ")}`;
      }
    }
  }
  if (body.tokenSymbols && !Array.isArray(body.tokenSymbols)) {
    return "tokenSymbols must be an array";
  }
  if (body.minSignals !== undefined) {
    const ms = Number(body.minSignals);
    if (ms < 1 || ms > 4) return "minSignals must be between 1 and 4";
  }
  if (body.priceChangeThreshold !== undefined) {
    const pct = Number(body.priceChangeThreshold);
    if (pct <= 0 || pct > 100) return "priceChangeThreshold must be between 0 and 100";
  }
  if (body.volumeChangeThreshold !== undefined) {
    const vct = Number(body.volumeChangeThreshold);
    if (vct <= 0 || vct > 1000) return "volumeChangeThreshold must be between 0 and 1000";
  }
  if (body.emailAddress !== undefined && body.emailAddress !== null) {
    if (typeof body.emailAddress === "string" && body.emailAddress.length > 0 && !body.emailAddress.includes("@")) {
      return "Invalid email address";
    }
  }
  return null;
}
