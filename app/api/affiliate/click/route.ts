import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/database";

export async function POST(request: NextRequest) {
  const { token, exchange } = await request.json();

  if (!token || !exchange) {
    return NextResponse.json({ error: "token and exchange are required" }, { status: 400 });
  }

  const allowed = ["bybit", "okx"];
  if (!allowed.includes(exchange.toLowerCase())) {
    return NextResponse.json({ error: "Invalid exchange" }, { status: 400 });
  }

  try {
    const pool = getPool();
    await pool.query(
      "INSERT INTO affiliate_clicks (token_symbol, exchange) VALUES ($1, $2)",
      [String(token).toUpperCase(), String(exchange).toLowerCase()]
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to track click" }, { status: 500 });
  }
}
