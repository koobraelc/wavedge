import { describe, it, expect } from "vitest";
import { signToken, verifyToken } from "./auth.js";

describe("auth", () => {
  it("signs and verifies a token", () => {
    const token = signToken("user-123");
    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("user-123");
  });

  it("rejects invalid tokens", () => {
    expect(verifyToken("garbage")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });
});
