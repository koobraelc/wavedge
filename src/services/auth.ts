import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { UserRepository, type User } from "../db/user-repository.js";

const JWT_SECRET = process.env.JWT_SECRET || "wavedge-dev-secret-change-in-production";
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
 * Middleware that requires a valid JWT. Returns 401 if missing/invalid.
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const payload = verifyToken(header.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const userRepo = new UserRepository();
  const user = userRepo.findById(payload.sub);
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
export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const payload = verifyToken(header.slice(7));
    if (payload) {
      const userRepo = new UserRepository();
      req.user = userRepo.findById(payload.sub);
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
