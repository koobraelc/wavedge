import { Router } from "express";
import { getPool } from "../db/database.js";

export function createAffiliateRouter(): Router {
  const router = Router();

  /** GET /api/affiliate/config — returns affiliate URLs (empty if not configured) */
  router.get("/config", (_req, res) => {
    const bybitUrl = process.env.BYBIT_AFFILIATE_URL || "";
    const okxUrl = process.env.OKX_AFFILIATE_URL || "";

    res.json({
      bybit: bybitUrl,
      okx: okxUrl,
      enabled: !!(bybitUrl || okxUrl),
    });
  });

  /** POST /api/affiliate/click — track an affiliate click */
  router.post("/click", async (req, res) => {
    const { token, exchange } = req.body;

    if (!token || !exchange) {
      res.status(400).json({ error: "token and exchange are required" });
      return;
    }

    const allowed = ["bybit", "okx"];
    if (!allowed.includes(exchange.toLowerCase())) {
      res.status(400).json({ error: "Invalid exchange" });
      return;
    }

    try {
      const pool = getPool();
      await pool.query(
        "INSERT INTO affiliate_clicks (token_symbol, exchange) VALUES ($1, $2)",
        [String(token).toUpperCase(), String(exchange).toLowerCase()]
      );

      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to track click" });
    }
  });

  return router;
}
