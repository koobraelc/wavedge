import { NextRequest, NextResponse } from "next/server";
import { PushRepository } from "@/lib/db/push-repository";

const pushRepository = new PushRepository();

export async function POST(request: NextRequest) {
  try {
    const { userId, subscription } = await request.json();
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: "Invalid push subscription object" }, { status: 400 });
    }

    await pushRepository.upsert(
      userId || "default",
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth
    );

    return NextResponse.json({ data: { subscribed: true } }, { status: 201 });
  } catch (err) {
    console.error("[Alerts] Push subscribe error:", err);
    return NextResponse.json({ error: "Failed to subscribe to push notifications" }, { status: 500 });
  }
}
