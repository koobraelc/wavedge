import { NextRequest, NextResponse } from "next/server";
import { PushRepository } from "@/lib/db/push-repository";

const pushRepository = new PushRepository();

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId") || "default";
    const hasSubscription = await pushRepository.hasSubscription(userId);
    return NextResponse.json({ data: { subscribed: hasSubscription } });
  } catch (err) {
    console.error("[Alerts] Push status error:", err);
    return NextResponse.json({ error: "Failed to check push status" }, { status: 500 });
  }
}
