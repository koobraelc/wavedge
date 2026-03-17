import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/database";

export async function GET() {
  try {
    const pool = getPool();
    const { rows } = await pool.query("SELECT NOW() as now");
    return NextResponse.json({
      status: "ok",
      database: "connected",
      timestamp: rows[0].now,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 }
    );
  }
}
