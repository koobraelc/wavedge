import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: {
      DATABASE_URL: process.env.DATABASE_URL ? "set" : "missing",
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ? "set" : "missing",
      CRON_SECRET: process.env.CRON_SECRET ? "set" : "missing",
      NODE_ENV: process.env.NODE_ENV || "missing",
    },
  });
}
