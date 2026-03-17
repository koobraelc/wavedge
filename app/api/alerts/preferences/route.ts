import { NextRequest, NextResponse } from "next/server";
import { AlertRepository } from "@/lib/db/alert-repository";

const VALID_SENSITIVITIES = ["low", "medium", "high"];
const VALID_CHANNELS = ["telegram", "email", "web", "push"];

const alertRepo = new AlertRepository();

function formatPreferences(row: NonNullable<Awaited<ReturnType<AlertRepository["getPreferences"]>>>) {
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
    whaleTransactionThreshold: row.whale_transaction_threshold,
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
    if (ms < 1 || ms > 5) return "minSignals must be between 1 and 5";
  }
  if (body.whaleTransactionThreshold !== undefined) {
    const wt = Number(body.whaleTransactionThreshold);
    if (wt <= 0) return "whaleTransactionThreshold must be positive";
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

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId") || "default";
    const prefs = await alertRepo.getPreferences(userId);

    if (!prefs) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({ data: formatPreferences(prefs) });
  } catch (err) {
    console.error("[Alerts] Preferences error:", err);
    return NextResponse.json({ error: "Failed to fetch preferences" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = validatePreferencesBody(body);
    if (validation) {
      return NextResponse.json({ error: validation }, { status: 400 });
    }

    const prefs = await alertRepo.upsertPreferences({
      userId: body.userId || "default",
      tokenSymbols: body.tokenSymbols,
      channels: body.channels,
      sensitivity: body.sensitivity,
      newsFrequencyThreshold: body.newsFrequencyThreshold,
      newsWindowMinutes: body.newsWindowMinutes,
      priceChangeThreshold: body.priceChangeThreshold,
      volumeChangeThreshold: body.volumeChangeThreshold,
      sentimentChangeThreshold: body.sentimentChangeThreshold,
      whaleTransactionThreshold: body.whaleTransactionThreshold,
      minSignals: body.minSignals,
      enabled: body.enabled,
      telegramChatId: body.telegramChatId,
      emailAddress: body.emailAddress,
    });

    return NextResponse.json({ data: formatPreferences(prefs) }, { status: 201 });
  } catch (err) {
    console.error("[Alerts] Create preferences error:", err);
    return NextResponse.json({ error: "Failed to create preferences" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = body.userId || "default";

    const existing = await alertRepo.getPreferences(userId);
    if (!existing) {
      return NextResponse.json({ error: "No preferences found. Use POST to create." }, { status: 404 });
    }

    const validation = validatePreferencesBody(body, true);
    if (validation) {
      return NextResponse.json({ error: validation }, { status: 400 });
    }

    const prefs = await alertRepo.upsertPreferences({
      userId,
      tokenSymbols: body.tokenSymbols,
      channels: body.channels,
      sensitivity: body.sensitivity,
      newsFrequencyThreshold: body.newsFrequencyThreshold,
      newsWindowMinutes: body.newsWindowMinutes,
      priceChangeThreshold: body.priceChangeThreshold,
      volumeChangeThreshold: body.volumeChangeThreshold,
      sentimentChangeThreshold: body.sentimentChangeThreshold,
      whaleTransactionThreshold: body.whaleTransactionThreshold,
      minSignals: body.minSignals,
      enabled: body.enabled,
      telegramChatId: body.telegramChatId,
      emailAddress: body.emailAddress,
    });

    return NextResponse.json({ data: formatPreferences(prefs) });
  } catch (err) {
    console.error("[Alerts] Update preferences error:", err);
    return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 });
  }
}
