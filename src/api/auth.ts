import { Router } from "express";
import { UserRepository } from "../db/user-repository.js";
import { signToken, requireAuth, type AuthenticatedRequest } from "../services/auth.js";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "noreply@wavedge.com";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

async function sendMagicLinkEmail(email: string, token: string): Promise<boolean> {
  const verifyUrl = `${APP_URL}/api/auth/verify?token=${token}`;

  if (!RESEND_API_KEY) {
    console.log(`[Auth] Magic link for ${email}: ${verifyUrl}`);
    return true;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: email,
        subject: "Sign in to Wavedge",
        html: `
          <h2>Sign in to Wavedge</h2>
          <p>Click the link below to sign in. This link expires in 15 minutes.</p>
          <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:white;text-decoration:none;border-radius:6px;">Sign in to Wavedge</a></p>
          <p style="color:#666;font-size:12px;">If you didn't request this, ignore this email.</p>
        `,
      }),
    });
    return response.ok;
  } catch (err) {
    console.error("[Auth] Failed to send email:", err);
    return false;
  }
}

export function createAuthRouter(): Router {
  const router = Router();
  const userRepo = new UserRepository();

  /**
   * POST /api/auth/magic-link
   * Request a magic link for email sign-in.
   */
  router.post("/magic-link", async (req, res) => {
    const { email } = req.body;
    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "Valid email is required" });
      return;
    }

    const magicLink = userRepo.createMagicLink(email.toLowerCase());
    const sent = await sendMagicLinkEmail(email.toLowerCase(), magicLink.token);

    if (!sent) {
      res.status(500).json({ error: "Failed to send magic link email" });
      return;
    }

    res.json({ message: "Magic link sent. Check your email." });
  });

  /**
   * GET /api/auth/verify?token=...
   * Verify magic link token and return JWT.
   */
  router.get("/verify", (req, res) => {
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      res.status(400).json({ error: "Token is required" });
      return;
    }

    const magicLink = userRepo.verifyMagicLink(token);
    if (!magicLink) {
      res.status(400).json({ error: "Invalid or expired link" });
      return;
    }

    const { user, isNew } = userRepo.findOrCreateByEmail(magicLink.email);
    const jwt = signToken(user.id);

    // If accessed from browser, redirect with token
    const accept = req.headers.accept || "";
    if (accept.includes("text/html")) {
      const callbackUrl = `${APP_URL}/auth/callback?token=${jwt}${isNew ? "&new=1" : ""}`;
      res.redirect(callbackUrl);
      return;
    }

    res.json({
      token: jwt,
      user: {
        id: user.id,
        email: user.email,
        tier: user.tier,
      },
      isNew,
    });
  });

  /**
   * GET /api/auth/me
   * Get current user info (requires auth).
   */
  router.get("/me", requireAuth as any, (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const subscription = userRepo.getActiveSubscription(user.id);

    res.json({
      id: user.id,
      email: user.email,
      tier: user.tier,
      subscription: subscription
        ? {
            status: subscription.status,
            plan: subscription.plan,
            current_period_end: subscription.current_period_end,
            cancel_at_period_end: !!subscription.cancel_at_period_end,
          }
        : null,
    });
  });

  return router;
}
