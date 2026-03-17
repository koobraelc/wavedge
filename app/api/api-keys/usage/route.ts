import { NextRequest, NextResponse } from "next/server";
import { requirePro } from "@/lib/services/auth";
import { ApiKeyRepository } from "@/lib/db/api-key-repository";
import { UserRepository } from "@/lib/db/user-repository";

const MAX_ACTIVE_KEYS = 5;
const apiKeyRepo = new ApiKeyRepository();

export async function GET(request: NextRequest) {
  const result = await requirePro(request);
  if (result instanceof NextResponse) return result;

  try {
    const userRepo = new UserRepository();
    const today = new Date().toISOString().split("T")[0];
    const usageToday = await userRepo.getApiUsageCount(result.id, today);
    const activeKeys = await apiKeyRepo.countActive(result.id);

    return NextResponse.json({
      usage_today: usageToday,
      daily_limit: 100,
      active_keys: activeKeys,
      max_keys: MAX_ACTIVE_KEYS,
    });
  } catch (err) {
    console.error("[ApiKeys] Usage error:", err);
    return NextResponse.json({ error: "Failed to fetch API key usage" }, { status: 500 });
  }
}
