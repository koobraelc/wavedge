import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "./auth";
import { checkApiRateLimit } from "./tier-limiter";

/**
 * Rate-limited API route wrapper.
 * Applies authentication + tier-based rate limiting to any route handler.
 *
 * Usage:
 *   export const GET = withRateLimit("/api/prices", async (req, user) => {
 *     // ... handler logic, user is guaranteed authenticated + rate-checked
 *     return NextResponse.json({ data });
 *   });
 */
export function withRateLimit(
  endpoint: string,
  handler: (req: NextRequest, user: { id: string; email: string; tier: "free" | "pro" }) => Promise<NextResponse>
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const rateLimitResponse = await checkApiRateLimit(user, endpoint);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    return handler(req, user);
  };
}
