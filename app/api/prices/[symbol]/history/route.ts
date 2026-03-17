import { NextRequest, NextResponse } from "next/server";
import { PriceRepository } from "@/lib/db/price-repository";

const priceRepo = new PriceRepository();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const token = await priceRepo.getTokenBySymbol(symbol);
    if (!token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    const limit = Math.min(
      Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "288")),
      5000
    );
    const history = await priceRepo.getPriceHistory(token.id, limit);
    return NextResponse.json({ data: history, count: history.length });
  } catch (err) {
    console.error("[Prices] History error:", err);
    return NextResponse.json({ error: "Failed to fetch price history" }, { status: 500 });
  }
}
