import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Signed, expiring, stateless OAuth `state` parameter — shared by both the
 * real and mock `OAuthConnectionService` so state validation logic is
 * identical (and unit-testable) regardless of which adapter is active.
 *
 * There is no server-side session store in this app for an anonymous
 * pre-auth redirect, so `state` itself carries everything needed to
 * validate the callback: it's an HMAC-SHA256 signature (keyed on
 * `AUTH_SECRET`, the same secret already used for session signing) over a
 * payload of {connectionId, nonce, iat}, checked for both signature
 * validity and a short expiry window. This defeats a forged/tampered state
 * (the signature can't be produced without AUTH_SECRET) and a replayed
 * stale state (the expiry check). It does not, by itself, bind the state
 * to the browser session that initiated the flow the way a double-submit
 * cookie would — see docs note in oauth-connection-service.ts.
 */

const STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthStatePayload {
  connectionId: string;
  nonce: string;
  iat: number;
}

export class InvalidOAuthStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOAuthStateError";
  }
}

export function signOAuthState(secret: string, connectionId: string): string {
  const payload: OAuthStatePayload = { connectionId, nonce: randomUUID(), iat: Date.now() };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyOAuthState(secret: string, state: string): OAuthStatePayload {
  const [body, signature] = state.split(".");
  if (!body || !signature) {
    throw new InvalidOAuthStateError("Malformed OAuth state parameter");
  }

  const expectedSignature = createHmac("sha256", secret).update(body).digest("base64url");
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new InvalidOAuthStateError("OAuth state signature is invalid");
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
  } catch {
    throw new InvalidOAuthStateError("OAuth state payload is not valid JSON");
  }

  if (typeof payload.connectionId !== "string" || typeof payload.iat !== "number") {
    throw new InvalidOAuthStateError("OAuth state payload is missing required fields");
  }
  if (Date.now() - payload.iat > STATE_TTL_MS) {
    throw new InvalidOAuthStateError("OAuth state has expired — restart the connect flow");
  }

  return payload;
}
