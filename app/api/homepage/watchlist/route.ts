import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/database";
import { getAuthenticatedUser } from "@/lib/services/auth";

interface WatchlistTokenRow {
  symbol: string;
  name: string;
  price_usd: number;
  price_change_percentage_24h: number | null;
  market_cap: number | null;
  news_count_24h: number;
}

export async function GET(request: NextRequest) {
  try {
    const pool = getPool();
    const user = await getAuthenticatedUser(request);
    let userSymbols: string[] | null = null;

    if (user) {
      const prefsResult = await pool.query(
        `SELECT token_symbols FROM alert_preferences WHERE user_id = $1`,
        [user.id]
      );

      if (prefsResult.rows.length > 0) {
        const parsed = JSON.parse(prefsResult.rows[0].token_symbols) as string[];
        if (parsed.length > 0) {
          userSymbols = parsed.map((s) => s.toLowerCase());
        }
      }
    }

    let tokens: WatchlistTokenRow[];

    if (userSymbols && userSymbols.length > 0) {
      const placeholders = userSymbols.map((_, i) => `$${i + 1}`).join(",");
      const result = await pool.query(
        `SELECT t.symbol, t.name, p.price_usd, p.price_change_percentage_24h, p.market_cap,
                (SELECT COUNT(*) FROM articles a
                 WHERE a.published_at >= NOW() - INTERVAL '24 hours'
                   AND a.token_tags LIKE '%"' || UPPER(t.symbol) || '"%') AS news_count_24h
         FROM tokens t
         JOIN (SELECT token_id, MAX(fetched_at) as max_fetched FROM prices GROUP BY token_id) lp ON lp.token_id = t.id
         JOIN prices p ON p.token_id = lp.token_id AND p.fetched_at = lp.max_fetched
         WHERE t.symbol IN (${placeholders})
         ORDER BY p.market_cap DESC`,
        userSymbols
      );
      tokens = result.rows as WatchlistTokenRow[];
    } else {
      const result = await pool.query(
        `SELECT t.symbol, t.name, p.price_usd, p.price_change_percentage_24h, p.market_cap,
                (SELECT COUNT(*) FROM articles a
                 WHERE a.published_at >= NOW() - INTERVAL '24 hours'
                   AND a.token_tags LIKE '%"' || UPPER(t.symbol) || '"%') AS news_count_24h
         FROM tokens t
         JOIN (SELECT token_id, MAX(fetched_at) as max_fetched FROM prices GROUP BY token_id) lp ON lp.token_id = t.id
         JOIN prices p ON p.token_id = lp.token_id AND p.fetched_at = lp.max_fetched
         ORDER BY p.market_cap DESC
         LIMIT 8`
      );
      tokens = result.rows as WatchlistTokenRow[];
    }

    return NextResponse.json({
      data: {
        tokens: tokens.map((t) => ({
          symbol: t.symbol,
          name: t.name,
          price: t.price_usd,
          change_24h: t.price_change_percentage_24h,
          market_cap: t.market_cap,
          news_count_24h: t.news_count_24h,
        })),
      },
    });
  } catch (err) {
    console.error("[Homepage] Watchlist error:", err);
    return NextResponse.json({ error: "Failed to fetch watchlist" }, { status: 500 });
  }
}
