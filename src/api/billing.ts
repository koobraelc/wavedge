import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../services/auth.js";
import { BillingService } from "../services/billing.js";

export function createBillingRouter(): Router {
  const router = Router();
  const billing = new BillingService();

  /**
   * POST /api/billing/checkout
   * Create a Stripe Checkout session for Pro subscription.
   */
  router.post("/checkout", requireAuth as any, async (req: AuthenticatedRequest, res) => {
    try {
      const url = await billing.createCheckoutSession(req.user!.id);
      res.json({ url });
    } catch (err) {
      console.error("[Billing] Checkout error:", err);
      res.status(500).json({ error: "Unable to create checkout session. Please try again later." });
    }
  });

  /**
   * POST /api/billing/portal
   * Create a Stripe Customer Portal session for managing subscription.
   */
  router.post("/portal", requireAuth as any, async (req: AuthenticatedRequest, res) => {
    try {
      const url = await billing.createPortalSession(req.user!.id);
      res.json({ url });
    } catch (err) {
      console.error("[Billing] Portal error:", err);
      res.status(500).json({ error: "Unable to create portal session. Please try again later." });
    }
  });

  return router;
}

/**
 * Stripe webhook handler — mounted separately with raw body parsing.
 */
export function createWebhookRouter(): Router {
  const router = Router();
  const billing = new BillingService();

  router.post("/stripe", (req, res) => {
    const signature = req.headers["stripe-signature"] as string;
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    try {
      // req.body is a raw Buffer when express.raw() is used
      billing.handleWebhookEvent(req.body as Buffer, signature);
      res.json({ received: true });
    } catch (err) {
      console.error("[Webhook] Error:", err);
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}
