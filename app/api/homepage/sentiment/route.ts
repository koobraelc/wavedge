import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/database";

interface SentimentRow {
  avg_change: number;
}

export async function GET() {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT ie.article_id, AVG(ie.change_24h) AS avg_change
       FROM impact_events ie
       JOIN articles a ON a.id = ie.article_id
       WHERE a.published_at >= NOW() - INTERVAL '24 hours'
         AND ie.change_24h IS NOT NULL
       GROUP BY ie.article_id`
    );
    const rows = result.rows as SentimentRow[];

    let bullish = 0;
    let bearish = 0;
    let neutral = 0;

    for (const row of rows) {
      if (row.avg_change > 0.1) {
        bullish++;
      } else if (row.avg_change < -0.1) {
        bearish++;
      } else {
        neutral++;
      }
    }

    const total = bullish + bearish + neutral;
    const score = total > 0 ? Math.round(((bullish - bearish) / total) * 100) : 0;
    const label = score > 10 ? "Bullish" : score < -10 ? "Bearish" : "Neutral";

    return NextResponse.json({ data: { bullish, bearish, neutral, score, label } });
  } catch (err) {
    console.error("[Homepage] Sentiment error:", err);
    return NextResponse.json({ error: "Failed to compute sentiment" }, { status: 500 });
  }
}
