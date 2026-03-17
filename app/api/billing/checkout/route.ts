import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/services/auth";
import { BillingService } from "@/lib/services/billing";

const billing = new BillingService();

export async function POST(request: NextRequest) {
  const result = await requireAuth(request);
  if (result instanceof NextResponse) return result;

  try {
    const url = await billing.createCheckoutSession(result.id);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[Billing] Checkout error:", err);
    return NextResponse.json(
      { error: "Unable to create checkout session. Please try again later." },
      { status: 500 }
    );
  }
}
