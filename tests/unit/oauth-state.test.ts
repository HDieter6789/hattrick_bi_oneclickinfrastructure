import { describe, expect, it, vi } from "vitest";
import { InvalidOAuthStateError, signOAuthState, verifyOAuthState } from "@/services/connections/oauth-state";

const SECRET = "test-auth-secret-at-least-16-chars";

describe("OAuth state signing/verification", () => {
  it("round-trips connectionId through a signed state", () => {
    const state = signOAuthState(SECRET, "conn_123");
    const payload = verifyOAuthState(SECRET, state);
    expect(payload.connectionId).toBe("conn_123");
  });

  it("produces a different state (nonce) on every call for the same connection", () => {
    const a = signOAuthState(SECRET, "conn_123");
    const b = signOAuthState(SECRET, "conn_123");
    expect(a).not.toBe(b);
  });

  it("rejects a state signed with a different secret", () => {
    const state = signOAuthState("a-completely-different-secret!!", "conn_123");
    expect(() => verifyOAuthState(SECRET, state)).toThrow(InvalidOAuthStateError);
  });

  it("rejects a tampered payload even if the signature format looks valid", () => {
    const state = signOAuthState(SECRET, "conn_123");
    const [, signature] = state.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ connectionId: "conn_999", nonce: "x", iat: Date.now() }), "utf8").toString(
      "base64url",
    );
    expect(() => verifyOAuthState(SECRET, `${tamperedPayload}.${signature}`)).toThrow(InvalidOAuthStateError);
  });

  it("rejects a malformed state string", () => {
    expect(() => verifyOAuthState(SECRET, "not-a-valid-state")).toThrow(InvalidOAuthStateError);
  });

  it("rejects an expired state", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const state = signOAuthState(SECRET, "conn_123");

      vi.setSystemTime(new Date("2026-01-01T00:11:00Z")); // 11 minutes later, past the 10-minute TTL
      expect(() => verifyOAuthState(SECRET, state)).toThrow(InvalidOAuthStateError);
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts a state just under the expiry window", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const state = signOAuthState(SECRET, "conn_123");

      vi.setSystemTime(new Date("2026-01-01T00:09:00Z")); // 9 minutes later
      expect(() => verifyOAuthState(SECRET, state)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});
