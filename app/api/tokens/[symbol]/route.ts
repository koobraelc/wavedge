import { NextResponse } from "next/server";
import { PriceRepository } from "@/lib/db/price-repository";
import { NewsRepository } from "@/lib/db/news-repository";

const prices = new PriceRepository();
const news = new NewsRepository();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const token = await prices.getTokenBySymbol(symbol);
    if (!token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    const history = await prices.getPriceHistory(token.id, 1);
    const latestPrice = history[0] || null;
    const articles = await news.getArticles({ tokenTag: token.symbol, limit: 10 });

    return NextResponse.json({
      data: { token, price: latestPrice, recentNews: articles },
    });
  } catch (err) {
    console.error("[Tokens] Overview error:", err);
    return NextResponse.json({ error: "Failed to fetch token overview" }, { status: 500 });
  }
}
