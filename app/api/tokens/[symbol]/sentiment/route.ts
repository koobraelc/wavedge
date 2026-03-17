import { NextResponse } from "next/server";
import { PriceRepository } from "@/lib/db/price-repository";
import { SocialRepository } from "@/lib/db/social-repository";

const prices = new PriceRepository();

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

    const socialRepo = new SocialRepository();
    const upperSymbol = token.symbol.toUpperCase();
    const latest = await socialRepo.getLatest(upperSymbol);
    const history = await socialRepo.getHistory(upperSymbol, 24);
    const change = await socialRepo.getMentionChange(upperSymbol);

    return NextResponse.json({
      data: {
        symbol: upperSymbol,
        current: latest
          ? {
              mentionCount: latest.mention_count,
              sentimentScore: latest.sentiment_score,
              sentimentLabel: latest.sentiment_label,
              positiveCount: latest.positive_count,
              negativeCount: latest.negative_count,
              neutralCount: latest.neutral_count,
              sampleTexts: JSON.parse(latest.sample_texts),
              source: latest.source,
              fetchedAt: latest.fetched_at,
            }
          : null,
        change: change
          ? {
              currentMentions: change.current,
              previousMentions: change.previous,
              changePercent: change.changePercent,
            }
          : null,
        history: history.map((h) => ({
          mentionCount: h.mention_count,
          sentimentScore: h.sentiment_score,
          sentimentLabel: h.sentiment_label,
          fetchedAt: h.fetched_at,
        })),
      },
    });
  } catch (err) {
    console.error("[Tokens] Sentiment error:", err);
    return NextResponse.json({ error: "Failed to fetch sentiment data" }, { status: 500 });
  }
}
