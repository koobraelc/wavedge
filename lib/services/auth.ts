import { NextRequest, NextResponse } from "next/server";
import { UserRepository, type User } from "@/lib/db/user-repository";
import { ApiKeyRepository } from "@/lib/db/api-key-repository";
import { auth } from "@/lib/auth";

export type { User };

/**
 * Authenticate a request via NextAuth session or API key (wv_ prefix).
 * Returns the user if authenticated, null otherwise.
 */
export async function getAuthenticatedUser(req: NextRequest): Promise<User | null> {
  const header = req.headers.get("authorization");

  // API key auth (wv_ prefix)
  if (header?.startsWith("Bearer wv_")) {
    const token = header.slice(7);
    const apiKeyRepo = new ApiKeyRepository();
    const apiKey = await apiKeyRepo.findByKey(token);
    if (!apiKey) return null;

    const userRepo = new UserRepository();
    const user = await userRepo.findById(apiKey.user_id);
    if (!user) return null;

    // Update last used timestamp (fire-and-forget)
    apiKeyRepo.touchLastUsed(apiKey.id);
    return user;
  }

  // NextAuth session auth
  const session = await auth();
  if (!session?.user?.id) return null;

  const userRepo = new UserRepository();
  return (await userRepo.findById(session.user.id)) ?? null;
}

/**
 * Helper to require authentication in API routes.
 * Returns either the user or a 401 Response.
 */
export async function requireAuth(req: NextRequest): Promise<User | NextResponse> {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  return user;
}

/**
 * Helper to require Pro tier in API routes.
 * Returns either the user or a 401/403 Response.
 */
export async function requirePro(req: NextRequest): Promise<User | NextResponse> {
  const result = await requireAuth(req);
  if (result instanceof NextResponse) return result;
  if (result.tier !== "pro") {
    return NextResponse.json({ error: "Pro subscription required" }, { status: 403 });
  }
  return result;
}
