import { NextResponse } from "next/server";
import { SocialRepository } from "@/lib/db/social-repository";

export async function GET() {
  try {
    const socialRepo = new SocialRepository();
    const all = await socialRepo.getLatestAll();

    return NextResponse.json({
      data: {
        tokens: all.map((s) => ({
          symbol: s.token_symbol,
          mentionCount: s.mention_count,
          sentimentScore: s.sentiment_score,
          sentimentLabel: s.sentiment_label,
          source: s.source,
          fetchedAt: s.fetched_at,
        })),
      },
    });
  } catch (err) {
    console.error("[Homepage] Social sentiment error:", err);
    return NextResponse.json({ error: "Failed to fetch social sentiment" }, { status: 500 });
  }
}
