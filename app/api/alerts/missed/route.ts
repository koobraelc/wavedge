import { NextRequest, NextResponse } from "next/server";
import { AlertRepository } from "@/lib/db/alert-repository";
import { UserRepository } from "@/lib/db/user-repository";
import { TIER_LIMITS } from "@/lib/services/tier-limiter";

const alertRepo = new AlertRepository();

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId") || "default";

    const userRepo = new UserRepository();
    const user = await userRepo.findById(userId);
    const tier = user?.tier ?? "free";

    if (tier === "pro") {
      return NextResponse.json({
        data: { missedToday: 0, alerts: [], tier: "pro", dailyLimit: null },
      });
    }

    const missedToday = await alertRepo.getDailyMissedAlertCount(userId);
    const missedAlerts = await alertRepo.getRecentMissedAlerts(userId, 24);
    const deliveredToday = await userRepo.getDailyAlertCount(userId);

    return NextResponse.json({
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
  } catch (err) {
    console.error("[Alerts] Missed error:", err);
    return NextResponse.json({ error: "Failed to fetch missed alerts" }, { status: 500 });
  }
}
