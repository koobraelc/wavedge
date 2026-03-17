import { NextRequest, NextResponse } from "next/server";
import { BillingService } from "@/lib/services/billing";

export const dynamic = "force-dynamic";

const billing = new BillingService();

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  try {
    const rawBody = Buffer.from(await request.arrayBuffer());
    billing.handleWebhookEvent(rawBody, signature);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[Webhook] Error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
