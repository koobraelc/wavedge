import { NextResponse } from "next/server";

export async function GET() {
  const bybitUrl = process.env.BYBIT_AFFILIATE_URL || "";
  const okxUrl = process.env.OKX_AFFILIATE_URL || "";

  return NextResponse.json({
    bybit: bybitUrl,
    okx: okxUrl,
    enabled: !!(bybitUrl || okxUrl),
  });
}
