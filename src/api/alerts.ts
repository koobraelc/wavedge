import { Router, type Request, type Response } from "express";
import { AlertRepository } from "../db/alert-repository.js";

const VALID_SENSITIVITIES = ["low", "medium", "high"];
const VALID_CHANNELS = ["telegram", "email", "web"];

export function createAlertsRouter(repo?: AlertRepository): Router {
  const router = Router();
  const alertRepo = repo || new AlertRepository();

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
    if (ms < 1 || ms > 3) return "minSignals must be between 1 and 3";
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
