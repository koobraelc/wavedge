import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/database";

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") || "").trim();
  if (!query) {
    return NextResponse.json({ error: "Query parameter 'q' is required" }, { status: 400 });
  }

  const limit = Math.min(Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "20")), 100);
  const pattern = `%${query}%`;

  try {
    const pool = getPool();

    const tokensResult = await pool.query(
      `SELECT t.id, t.symbol, t.name, p.price_usd, p.market_cap
       FROM tokens t
       LEFT JOIN prices p ON p.token_id = t.id
         AND p.fetched_at = (SELECT MAX(p2.fetched_at) FROM prices p2 WHERE p2.token_id = t.id)
       WHERE t.symbol LIKE $1 OR t.name LIKE $2
       ORDER BY p.market_cap DESC NULLS LAST
       LIMIT $3`,
      [pattern, pattern, limit]
    );

    const articlesResult = await pool.query(
      `SELECT id, guid, title, summary, url, source, published_at, relevance_score, token_tags
       FROM articles
       WHERE title LIKE $1 OR summary LIKE $2
       ORDER BY relevance_score DESC, published_at DESC
       LIMIT $3`,
      [pattern, pattern, limit]
    );

    return NextResponse.json({
      data: { tokens: tokensResult.rows, articles: articlesResult.rows },
      query,
    });
  } catch (err) {
    console.error("[Search] Error:", err);
    return NextResponse.json({ error: "Failed to perform search" }, { status: 500 });
  }
}
