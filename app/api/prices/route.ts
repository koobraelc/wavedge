import { NextRequest, NextResponse } from "next/server";
import { PriceRepository } from "@/lib/db/price-repository";

const priceRepo = new PriceRepository();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const sort = searchParams.get("sort") || "market_cap";
    const order = searchParams.get("order") === "asc" ? "asc" : "desc";
    const symbol = searchParams.get("symbol") || undefined;

    let prices = await priceRepo.getLatestPrices();

    if (symbol) {
      const symbols = symbol.toLowerCase().split(",");
      prices = prices.filter((p) => symbols.includes(p.symbol));
    }

    if (sort === "price") {
      prices.sort((a, b) =>
        order === "asc" ? a.price_usd - b.price_usd : b.price_usd - a.price_usd
      );
    } else if (sort === "change") {
      prices.sort((a, b) => {
        const aVal = a.price_change_percentage_24h ?? 0;
        const bVal = b.price_change_percentage_24h ?? 0;
        return order === "asc" ? aVal - bVal : bVal - aVal;
      });
    }

    return NextResponse.json({ data: prices, count: prices.length });
  } catch (err) {
    console.error("[Prices] Error:", err);
    return NextResponse.json({ error: "Failed to fetch prices" }, { status: 500 });
  }
}
