import { NextRequest, NextResponse } from "next/server";
import { PushRepository } from "@/lib/db/push-repository";

const pushRepository = new PushRepository();

export async function POST(request: NextRequest) {
  try {
    const { endpoint } = await request.json();
    if (!endpoint) {
      return NextResponse.json({ error: "endpoint is required" }, { status: 400 });
    }

    await pushRepository.removeByEndpoint(endpoint);

    return NextResponse.json({ data: { unsubscribed: true } });
  } catch (err) {
    console.error("[Alerts] Push unsubscribe error:", err);
    return NextResponse.json({ error: "Failed to unsubscribe from push notifications" }, { status: 500 });
  }
}
