import { NextRequest, NextResponse } from "next/server";
import { WhaleRepository } from "@/lib/db/whale-repository";

const whaleRepo = new WhaleRepository();

export async function GET(request: NextRequest) {
  try {
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit")) || 50, 200);

    const transactions = await whaleRepo.getLatestAll(limit);
    return NextResponse.json({
      data: transactions.map((tx) => ({
        id: tx.id,
        tokenSymbol: tx.token_symbol,
        transactionHash: tx.transaction_hash,
        fromAddress: tx.from_address,
        toAddress: tx.to_address,
        amount: tx.amount,
        amountUsd: tx.amount_usd,
        blockchain: tx.blockchain,
        transactionType: tx.transaction_type,
        fetchedAt: tx.fetched_at,
      })),
      count: transactions.length,
    });
  } catch (err) {
    console.error("[Whales] Recent error:", err);
    return NextResponse.json({ error: "Failed to fetch recent whale transactions" }, { status: 500 });
  }
}
