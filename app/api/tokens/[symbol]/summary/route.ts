import { NextRequest, NextResponse } from "next/server";
import { PriceRepository } from "@/lib/db/price-repository";
import { ImpactRepository } from "@/lib/db/impact-repository";
import { SummaryService } from "@/lib/services/summary-service";

const prices = new PriceRepository();
const summaries = new SummaryService(new ImpactRepository());

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toLowerCase();
  const token = await prices.getTokenBySymbol(symbol);
  if (!token) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }

  const lang = request.nextUrl.searchParams.get("lang") === "zh" ? "zh" : "en";

  try {
    const summary = await summaries.getSummary(token.symbol, lang);
    if (!summary) {
      return NextResponse.json({
        data: {
          symbol: token.symbol.toUpperCase(),
          lang,
          summary: null,
          sentimentBreakdown: {},
          netImpact: "neutral",
          keyEvents: [],
          articleCount: 0,
          generatedAt: null,
        },
        status: "no_data",
        message: "No news data available yet. Summary will generate automatically when articles are collected.",
      });
    }
    return NextResponse.json({ data: summary, status: "ready" });
  } catch (error) {
    console.error("Summary generation error:", error);
    return NextResponse.json({
      data: null,
      status: "error",
      message: "Summary is temporarily unavailable. Tap to retry.",
      retryAfter: 30,
    });
  }
}
