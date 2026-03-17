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

    const displaySymbol = token.symbol.toUpperCase();
    const displayName = token.name;
    const faqData = await impact.getFaqData(token.symbol);

    const faqs: { question: string; answer: string }[] = [];

    if (faqData.length > 0) {
      const categoryList = faqData
        .slice(0, 5)
        .map((f) => {
          const dir = f.direction === "bullish" ? "+" : f.direction === "bearish" ? "" : "~";
          return `${f.category} (${dir}${f.avgChange24h.toFixed(2)}% avg 24h impact, ${f.sampleSize} events)`;
        })
        .join(", ");
      faqs.push({
        question: `What affects ${displayName} (${displaySymbol}) price?`,
        answer: `Based on ${faqData.reduce((s, f) => s + f.sampleSize, 0)} analyzed events, the top factors affecting ${displaySymbol} price are: ${categoryList}. These impacts are measured as average 24-hour price changes following news in each category.`,
      });

      for (const cat of faqData.slice(0, 4)) {
        const sign = cat.avgChange24h > 0 ? "+" : "";
        faqs.push({
          question: `How does ${cat.category} news affect ${displaySymbol}?`,
          answer: `${cat.category.charAt(0).toUpperCase() + cat.category.slice(1)} news has a ${cat.direction} effect on ${displaySymbol}, with an average 24-hour price change of ${sign}${cat.avgChange24h.toFixed(2)}% based on ${cat.sampleSize} events.${cat.recentExample ? ` Recent example: "${cat.recentExample}".` : ""}`,
        });
      }
    } else {
      faqs.push({
        question: `What affects ${displayName} (${displaySymbol}) price?`,
        answer: `We are actively tracking news events and their impact on ${displaySymbol} price. Check back soon for data-backed insights on what drives ${displaySymbol} price movements.`,
      });
    }

    faqs.push({
      question: `Where can I get ${displaySymbol} news today?`,
      answer: `Wavedge aggregates ${displaySymbol} news from 14+ sources in real-time, classifies each article by category, and measures its historical price impact. Visit the ${displayName} page for the latest AI-analyzed news and alerts.`,
    });

    return NextResponse.json({ data: { symbol: displaySymbol, name: displayName, faqs } });
  } catch (err) {
    console.error("[Tokens] FAQ error:", err);
    return NextResponse.json({ error: "Failed to fetch FAQ data" }, { status: 500 });
  }
}
