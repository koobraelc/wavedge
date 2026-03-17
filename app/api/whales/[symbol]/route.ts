import { NextRequest, NextResponse } from "next/server";
import { WhaleRepository } from "@/lib/db/whale-repository";

const whaleRepo = new WhaleRepository();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol: rawSymbol } = await params;
    const symbol = rawSymbol.toUpperCase();
    const hours = Math.min(Number(request.nextUrl.searchParams.get("hours")) || 24, 168);

    const transactions = await whaleRepo.getRecent(symbol, hours);
    const totalUsd = await whaleRepo.getVolumeUsd(symbol, hours);
    const txCount = await whaleRepo.getCount(symbol, hours);

    return NextResponse.json({
      data: {
        tokenSymbol: symbol,
        hours,
        transactionCount: txCount,
        totalUsd,
        transactions: transactions.map((tx) => ({
          id: tx.id,
          transactionHash: tx.transaction_hash,
          fromAddress: tx.from_address,
          toAddress: tx.to_address,
          amount: tx.amount,
          amountUsd: tx.amount_usd,
          blockchain: tx.blockchain,
          transactionType: tx.transaction_type,
          fetchedAt: tx.fetched_at,
        })),
      },
    });
  } catch (err) {
    console.error("[Whales] Token error:", err);
    return NextResponse.json({ error: "Failed to fetch whale transactions" }, { status: 500 });
  }
}
