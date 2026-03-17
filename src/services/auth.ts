import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { UserRepository, type User } from "../db/user-repository.js";
import { ApiKeyRepository } from "../db/api-key-repository.js";
import { getEnvConfig } from "../config/env.js";

const JWT_SECRET = getEnvConfig().JWT_SECRET;
const JWT_EXPIRES_IN = "7d";

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): { sub: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { sub: string };
  } catch {
    return null;
  }
}

/**
 * Middleware that requires a valid JWT or API key. Returns 401 if missing/invalid.
 * API keys use the format: Bearer wv_...
 */
export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const token = header.slice(7);
  const userRepo = new UserRepository();

  // Check if this is an API key (wv_ prefix)
  if (token.startsWith("wv_")) {
    const apiKeyRepo = new ApiKeyRepository();
    const apiKey = await apiKeyRepo.findByKey(token);
    if (!apiKey) {
      res.status(401).json({ error: "Invalid or revoked API key" });
      return;
    }

    const user = await userRepo.findById(apiKey.user_id);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    // Update last used timestamp (fire-and-forget)
    apiKeyRepo.touchLastUsed(apiKey.id);

    req.user = user;
    next();
    return;
  }

  // Otherwise treat as JWT
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const user = await userRepo.findById(payload.sub);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  req.user = user;
  next();
}

/**
 * Middleware that optionally extracts user from JWT but does not block.
 * Useful for routes that work for both anon and authenticated users.
 */
export async function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7);
    const userRepo = new UserRepository();

    if (token.startsWith("wv_")) {
      const apiKeyRepo = new ApiKeyRepository();
      const apiKey = await apiKeyRepo.findByKey(token);
      if (apiKey) {
        req.user = await userRepo.findById(apiKey.user_id) ?? undefined;
        apiKeyRepo.touchLastUsed(apiKey.id);
      }
    } else {
      const payload = verifyToken(token);
      if (payload) {
        req.user = await userRepo.findById(payload.sub) ?? undefined;
      }
    }
  }
  next();
}

/**
 * Middleware that requires the user to have a Pro tier subscription.
 * Must be used after requireAuth.
 */
export function requirePro(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (req.user.tier !== "pro") {
    res.status(403).json({ error: "Pro subscription required" });
    return;
  }
  next();
}
