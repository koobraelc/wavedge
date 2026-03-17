import { NextRequest, NextResponse } from "next/server";
import { AlertRepository } from "@/lib/db/alert-repository";

const alertRepo = new AlertRepository();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const userId = searchParams.get("userId") || "default";
    const hours = Math.min(Number(searchParams.get("hours")) || 24, 168);

    const alerts = await alertRepo.getRecentAlerts(userId, hours);
    return NextResponse.json({
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
  } catch (err) {
    console.error("[Alerts] History error:", err);
    return NextResponse.json({ error: "Failed to fetch alert history" }, { status: 500 });
  }
}
