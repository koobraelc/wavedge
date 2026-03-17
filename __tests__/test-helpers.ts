import { NextRequest } from "next/server";
import { vi } from "vitest";

/**
 * Create a mock NextRequest for testing route handlers.
 */
export function createRequest(
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  }
): NextRequest {
  const fullUrl = url.startsWith("http") ? url : `http://localhost:3000${url}`;
  const init: RequestInit = {
    method: options?.method ?? "GET",
    headers: options?.headers ?? {},
  };
  if (options?.body !== undefined) {
    init.body = JSON.stringify(options.body);
    (init.headers as Record<string, string>)["content-type"] = "application/json";
  }
  return new NextRequest(fullUrl, init);
}

/**
 * Parse JSON from a NextResponse.
 */
export async function parseResponse(res: Response): Promise<{ status: number; body: any }> {
  const body = await res.json();
  return { status: res.status, body };
}

/**
 * Create a mock user object for auth mocking.
 */
export function mockUser(overrides: Partial<{
  id: string;
  email: string;
  tier: "free" | "pro";
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}> = {}) {
  return {
    id: overrides.id ?? "user-test-1",
    email: overrides.email ?? "test@wavedge.io",
    tier: overrides.tier ?? "free",
    stripe_customer_id: overrides.stripe_customer_id ?? null,
    created_at: overrides.created_at ?? "2026-01-01T00:00:00Z",
    updated_at: overrides.updated_at ?? "2026-01-01T00:00:00Z",
  };
}

/**
 * Create a mock constructor that returns a given instance object.
 * Works with `new ClassName()` in mocked modules.
 */
export function mockClass(instance: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  const Ctor = vi.fn() as unknown as Function;
  Ctor.prototype = instance;
  return Ctor;
}
