import Stripe from "stripe";
import crypto from "crypto";
import { UserRepository } from "@/lib/db/user-repository";
import { getEnvConfig } from "@/lib/config/env";

function getStripe(): Stripe | null {
  const key = getEnvConfig().STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export class BillingService {
  private userRepo = new UserRepository();

  async createCheckoutSession(userId: string): Promise<string | null> {
    const stripe = getStripe();
    if (!stripe) throw new Error("Stripe is not configured");

    const user = await this.userRepo.findById(userId);
    if (!user) throw new Error("User not found");

    // Get or create Stripe customer
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { wavedge_user_id: user.id },
      });
      customerId = customer.id;
      await this.userRepo.updateStripeCustomerId(userId, customerId);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: getEnvConfig().STRIPE_PRO_PRICE_ID, quantity: 1 }],
      success_url: `${getEnvConfig().APP_URL}/billing?status=success`,
      cancel_url: `${getEnvConfig().APP_URL}/billing?status=cancelled`,
      metadata: { wavedge_user_id: userId },
    });

    return session.url;
  }

  async createPortalSession(userId: string): Promise<string | null> {
    const stripe = getStripe();
    if (!stripe) throw new Error("Stripe is not configured");

    const user = await this.userRepo.findById(userId);
    if (!user?.stripe_customer_id) {
      throw new Error("No billing account found");
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${getEnvConfig().APP_URL}/billing`,
    });

    return session.url;
  }

  handleWebhookEvent(payload: Buffer, signature: string): void {
    const stripe = getStripe();
    if (!stripe) throw new Error("Stripe is not configured");

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, getEnvConfig().STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      throw new Error(`Webhook signature verification failed: ${(err as Error).message}`);
    }

    this.processEvent(event);
  }

  async processEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.handleCheckoutCompleted(session);
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await this.handleSubscriptionUpdated(sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await this.handleSubscriptionDeleted(sub);
        break;
      }
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const userId = session.metadata?.wavedge_user_id;
    if (!userId || !session.subscription) return;

    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription.id;

    await this.userRepo.upsertSubscription({
      id: crypto.randomUUID(),
      userId,
      stripeSubscriptionId: subscriptionId,
      status: "active",
    });
    await this.userRepo.updateTier(userId, "pro");
  }

  private async handleSubscriptionUpdated(sub: Stripe.Subscription): Promise<void> {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const user = await this.userRepo.findByStripeCustomerId(customerId);
    if (!user) return;

    // Period dates live on the first item in newer Stripe API versions
    const firstItem = sub.items?.data?.[0];
    const periodStart = firstItem?.current_period_start;
    const periodEnd = firstItem?.current_period_end;

    await this.userRepo.upsertSubscription({
      id: crypto.randomUUID(),
      userId: user.id,
      stripeSubscriptionId: sub.id,
      status: sub.status,
      currentPeriodStart: periodStart ? new Date(periodStart * 1000).toISOString() : undefined,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : undefined,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    });

    const isActive = ["active", "trialing"].includes(sub.status);
    await this.userRepo.updateTier(user.id, isActive ? "pro" : "free");
  }

  private async handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const user = await this.userRepo.findByStripeCustomerId(customerId);
    if (!user) return;

    await this.userRepo.upsertSubscription({
      id: crypto.randomUUID(),
      userId: user.id,
      stripeSubscriptionId: sub.id,
      status: "canceled",
    });
    await this.userRepo.updateTier(user.id, "free");
  }
}
