import Stripe from "stripe";
import crypto from "crypto";
import { UserRepository } from "../db/user-repository.js";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const STRIPE_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || "";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

function getStripe(): Stripe | null {
  if (!STRIPE_SECRET_KEY) return null;
  return new Stripe(STRIPE_SECRET_KEY);
}

export class BillingService {
  private userRepo = new UserRepository();

  async createCheckoutSession(userId: string): Promise<string | null> {
    const stripe = getStripe();
    if (!stripe) throw new Error("Stripe is not configured");

    const user = this.userRepo.findById(userId);
    if (!user) throw new Error("User not found");

    // Get or create Stripe customer
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { wavedge_user_id: user.id },
      });
      customerId = customer.id;
      this.userRepo.updateStripeCustomerId(userId, customerId);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${APP_URL}/billing?status=success`,
      cancel_url: `${APP_URL}/billing?status=cancelled`,
      metadata: { wavedge_user_id: userId },
    });

    return session.url;
  }

  async createPortalSession(userId: string): Promise<string | null> {
    const stripe = getStripe();
    if (!stripe) throw new Error("Stripe is not configured");

    const user = this.userRepo.findById(userId);
    if (!user?.stripe_customer_id) {
      throw new Error("No billing account found");
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${APP_URL}/billing`,
    });

    return session.url;
  }

  handleWebhookEvent(payload: Buffer, signature: string): void {
    const stripe = getStripe();
    if (!stripe) throw new Error("Stripe is not configured");

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      throw new Error(`Webhook signature verification failed: ${(err as Error).message}`);
    }

    this.processEvent(event);
  }

  processEvent(event: Stripe.Event): void {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        this.handleCheckoutCompleted(session);
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        this.handleSubscriptionUpdated(sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        this.handleSubscriptionDeleted(sub);
        break;
      }
    }
  }

  private handleCheckoutCompleted(session: Stripe.Checkout.Session): void {
    const userId = session.metadata?.wavedge_user_id;
    if (!userId || !session.subscription) return;

    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id;

    this.userRepo.upsertSubscription({
      id: crypto.randomUUID(),
      userId,
      stripeSubscriptionId: subscriptionId,
      status: "active",
    });
    this.userRepo.updateTier(userId, "pro");
  }

  private handleSubscriptionUpdated(sub: Stripe.Subscription): void {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const user = this.userRepo.findByStripeCustomerId(customerId);
    if (!user) return;

    // Period dates live on the first item in newer Stripe API versions
    const firstItem = sub.items?.data?.[0];
    const periodStart = firstItem?.current_period_start;
    const periodEnd = firstItem?.current_period_end;

    this.userRepo.upsertSubscription({
      id: crypto.randomUUID(),
      userId: user.id,
      stripeSubscriptionId: sub.id,
      status: sub.status,
      currentPeriodStart: periodStart ? new Date(periodStart * 1000).toISOString() : undefined,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : undefined,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    });

    const isActive = ["active", "trialing"].includes(sub.status);
    this.userRepo.updateTier(user.id, isActive ? "pro" : "free");
  }

  private handleSubscriptionDeleted(sub: Stripe.Subscription): void {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const user = this.userRepo.findByStripeCustomerId(customerId);
    if (!user) return;

    this.userRepo.upsertSubscription({
      id: crypto.randomUUID(),
      userId: user.id,
      stripeSubscriptionId: sub.id,
      status: "canceled",
    });
    this.userRepo.updateTier(user.id, "free");
  }
}
