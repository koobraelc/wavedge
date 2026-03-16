import { Router, type Request, type Response } from "express";
import { WhaleRepository } from "../db/whale-repository.js";

export function createWhalesRouter(repo?: WhaleRepository): Router {
  const router = Router();
  const whaleRepo = repo || new WhaleRepository();

  // GET /api/whales/recent — get recent whale transactions
  router.get("/recent", (req: Request, res: Response) => {
    const hours = Math.min(Number(req.query.hours) || 24, 168); // max 7 days
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const transactions = whaleRepo.getLatestAll(limit);
    res.json({
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
  });

  // GET /api/whales/:symbol — get whale transactions for a specific token
  router.get("/:symbol", (req: Request, res: Response) => {
    const symbol = (req.params.symbol as string).toUpperCase();
    const hours = Math.min(Number(req.query.hours) || 24, 168);

    const transactions = whaleRepo.getRecent(symbol, hours);
    const totalUsd = whaleRepo.getVolumeUsd(symbol, hours);
    const txCount = whaleRepo.getCount(symbol, hours);

    res.json({
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
  });

  // GET /api/whales/summary/all — get whale activity summary across all tokens
  router.get("/summary/all", (_req: Request, res: Response) => {
    const summary = whaleRepo.getSummary(24);
    res.json({
      data: summary.map((s) => ({
        tokenSymbol: s.token_symbol,
        transactionCount: s.tx_count,
        totalUsd: s.total_usd,
      })),
    });
  });

  return router;
}
