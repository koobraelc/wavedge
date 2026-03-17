import { NextResponse } from "next/server";
import { PriceRepository } from "@/lib/db/price-repository";
import { ImpactRepository } from "@/lib/db/impact-repository";

const prices = new PriceRepository();
const impact = new ImpactRepository();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol: rawSymbol } = await params;
    const symbol = rawSymbol.toLowerCase();
    const token = await prices.getTokenBySymbol(symbol);
    if (!token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    const stats = await impact.getImpactStatsByToken(token.symbol);
    const recentArticles = await impact.getRecentClassifiedArticles(token.symbol, 30);

    return NextResponse.json({
      data: {
        symbol: token.symbol.toUpperCase(),
        categories: stats,
        recentArticleCount: recentArticles.length,
        totalEvents: stats.reduce((sum, s) => sum + s.sampleSize, 0),
      },
    });
  } catch (err) {
    console.error("[Tokens] Impact error:", err);
    return NextResponse.json({ error: "Failed to fetch impact data" }, { status: 500 });
  }
}
