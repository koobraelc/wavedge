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

    const related = await impact.getRelatedTokens(token.symbol);

    const enriched = [];
    for (const r of related) {
      const relToken = await prices.getTokenBySymbol(r.symbol.toLowerCase());
      enriched.push({
        symbol: r.symbol,
        name: relToken?.name || r.symbol,
        coMentions: r.coMentions,
      });
    }

    return NextResponse.json({ data: { symbol: token.symbol.toUpperCase(), related: enriched } });
  } catch (err) {
    console.error("[Tokens] Related error:", err);
    return NextResponse.json({ error: "Failed to fetch related tokens" }, { status: 500 });
  }
}
