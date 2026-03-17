import { NextResponse } from "next/server";
import { WhaleRepository } from "@/lib/db/whale-repository";

const whaleRepo = new WhaleRepository();

export async function GET() {
  try {
    const summary = await whaleRepo.getSummary(24);
    return NextResponse.json({
      data: summary.map((s) => ({
        tokenSymbol: s.token_symbol,
        transactionCount: s.tx_count,
        totalUsd: s.total_usd,
      })),
    });
  } catch (err) {
    console.error("[Whales] Summary error:", err);
    return NextResponse.json({ error: "Failed to fetch whale summary" }, { status: 500 });
  }
}
